// GET /api/cover?k=&q=&sig= (spec §11). Public, but the signature must
// verify before anything else happens. Found covers 302 with a year-long CDN
// cache, so each item is looked up roughly once across all visitors.
import { Hono } from 'hono'
import { lookupGoogleBooks, UpstreamError } from './google-books'
import { isCoverKind, verifyCover } from './sign'
import { lookupTmdb } from './tmdb'
import type { BookParams, CoverKind, FetchLike, MovieParams, VideoParams } from './types'
import { youtubeThumbnail } from './youtube'

export const FOUND_CACHE = 'public, max-age=86400, s-maxage=31536000, immutable'
export const MISS_CACHE = 'public, s-maxage=86400'
export const NO_STORE = 'no-store'
// A 429 from Google Books or TMDB: let the CDN absorb the retries for 5 minutes instead of
// hammering a rate-limited upstream once per visitor. Other upstream errors stay uncached.
export const RATE_LIMITED_CACHE = 'public, s-maxage=300'

export type CoverDeps = {
  secret: () => string | undefined
  googleBooksKey?: () => string | undefined
  tmdbKey?: () => string | undefined
  fetch?: FetchLike
  timeoutMs?: number
}

function isAbort(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

export function createCoverRoute(deps: CoverDeps): Hono {
  const app = new Hono()
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init))

  app.get('/', async c => {
    const k = c.req.query('k') ?? ''
    const q = c.req.query('q') ?? ''
    const sig = c.req.query('sig') ?? ''
    const secret = deps.secret()
    if (!secret || !isCoverKind(k) || !verifyCover(secret, k, q, sig)) {
      return c.json({ error: 'bad_signature' }, 403, { 'Cache-Control': NO_STORE })
    }
    let params: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(q)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      params = parsed as Record<string, unknown>
    } catch {
      return c.json({ error: 'bad_params' }, 400, { 'Cache-Control': NO_STORE })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 4000)
    try {
      const image = await resolve(k, params, controller.signal)
      if (!image) return c.json({ error: 'not_found' }, 404, { 'Cache-Control': MISS_CACHE })
      return c.body(null, 302, { Location: image, 'Cache-Control': FOUND_CACHE })
    } catch (error) {
      if (isAbort(error)) return c.json({ error: 'timeout' }, 504, { 'Cache-Control': NO_STORE })
      if (error instanceof UpstreamError) {
        const cache = error.status === 429 ? RATE_LIMITED_CACHE : NO_STORE
        return c.json({ error: 'upstream', status: error.status }, 502, { 'Cache-Control': cache })
      }
      console.error('cover lookup failed', error)
      return c.json({ error: 'internal' }, 500, { 'Cache-Control': NO_STORE })
    } finally {
      clearTimeout(timer)
    }
  })

  async function resolve(k: CoverKind, params: Record<string, unknown>, signal: AbortSignal): Promise<string | null> {
    if (k === 'video') return youtubeThumbnail(String((params as VideoParams).url ?? ''))
    if (k === 'movie') {
      return lookupTmdb(params as MovieParams, { fetch: doFetch, apiKey: deps.tmdbKey?.(), signal })
    }
    return lookupGoogleBooks(params as BookParams, { fetch: doFetch, apiKey: deps.googleBooksKey?.(), signal })
  }

  return app
}
