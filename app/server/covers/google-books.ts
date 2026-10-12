// Google Books cover lookup (spec §11): isbn first, then intitle/inauthor.
// Takes the first item that has imageLinks.thumbnail, upgraded to https
// without the page-curl effect.
import type { BookParams, FetchLike } from './types'

const ENDPOINT = 'https://www.googleapis.com/books/v1/volumes'

export class UpstreamError extends Error {
  constructor(public status: number) {
    super(`Upstream responded ${status}`)
  }
}

type Volumes = { totalItems?: number; items?: Array<{ volumeInfo?: { imageLinks?: { thumbnail?: string } } }> }

export function cleanThumbnail(url: string): string {
  const u = new URL(url.replace(/^http:/, 'https:'))
  u.searchParams.delete('edge')
  return u.toString()
}

async function search(
  q: string,
  opts: { fetch: FetchLike; apiKey?: string; signal?: AbortSignal }
): Promise<string | null> {
  const params = new URLSearchParams({ q, maxResults: '5', printType: 'books' })
  if (opts.apiKey) params.set('key', opts.apiKey)
  const res = await opts.fetch(`${ENDPOINT}?${params}`, { signal: opts.signal })
  if (!res.ok) throw new UpstreamError(res.status)
  const body = (await res.json()) as Volumes
  for (const item of body.items ?? []) {
    const thumb = item.volumeInfo?.imageLinks?.thumbnail
    if (thumb) return cleanThumbnail(thumb)
  }
  return null
}

const unquote = (s: string) => s.replaceAll('"', '').replace(/\s+/g, ' ').trim()

export async function lookupGoogleBooks(
  params: BookParams,
  opts: { fetch: FetchLike; apiKey?: string; signal?: AbortSignal }
): Promise<string | null> {
  if (params.isbn) {
    const hit = await search(`isbn:${params.isbn}`, opts)
    if (hit) return hit
  }
  const title = unquote(params.title)
  if (!title) return null
  const author = params.author ? unquote(params.author) : ''
  return search(author ? `intitle:${title} inauthor:${author}` : `intitle:${title}`, opts)
}
