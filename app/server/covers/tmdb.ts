// TMDB poster lookup (spec §11). Needs TMDB_API_KEY. A v3 key goes in
// ?api_key=; a v4 read access token (a JWT, "eyJ…") goes in a Bearer header.
// Without a key there's no lookup: the route answers 404 and the client
// shows the typographic tile.
import { UpstreamError } from './google-books'
import type { FetchLike, MovieParams } from './types'

const ENDPOINT = 'https://api.themoviedb.org/3/search/movie'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

type Search = { results?: Array<{ poster_path?: string | null }> }

async function search(
  params: MovieParams,
  withYear: boolean,
  opts: { fetch: FetchLike; apiKey: string; signal?: AbortSignal }
): Promise<string | null> {
  const qs = new URLSearchParams({ query: params.title, include_adult: 'false' })
  if (withYear && params.year) qs.set('year', String(params.year))
  const headers: Record<string, string> = { accept: 'application/json' }
  if (opts.apiKey.startsWith('eyJ')) headers.authorization = `Bearer ${opts.apiKey}`
  else qs.set('api_key', opts.apiKey)
  const res = await opts.fetch(`${ENDPOINT}?${qs}`, { headers, signal: opts.signal })
  if (!res.ok) throw new UpstreamError(res.status)
  const body = (await res.json()) as Search
  const poster = body.results?.find(r => r.poster_path)?.poster_path
  return poster ? `${IMAGE_BASE}${poster}` : null
}

export async function lookupTmdb(
  params: MovieParams,
  opts: { fetch: FetchLike; apiKey?: string; signal?: AbortSignal }
): Promise<string | null> {
  const apiKey = opts.apiKey?.trim()
  if (!apiKey || !params.title.trim()) return null
  const o = { ...opts, apiKey }
  const hit = await search(params, true, o)
  if (hit || !params.year) return hit
  return search(params, false, o)
}
