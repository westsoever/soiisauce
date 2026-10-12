// Signed cover URLs: /api/cover?k=<kind>&q=<json params>&sig=<hmac>.
// The sig is HMAC-SHA256(secret, k + q), base64url, first 22 chars (spec §11).
// node:crypto is used because it's synchronous and note decorators are sync.
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CoverKind, CoverParams } from './types'

const KEY_ORDER: Record<CoverKind, string[]> = {
  book: ['isbn', 'title', 'author'],
  movie: ['title', 'year'],
  video: ['url']
}

export function isCoverKind(k: string): k is CoverKind {
  return k === 'book' || k === 'movie' || k === 'video'
}

export function canonicalParams(kind: CoverKind, params: CoverParams): string {
  const source = params as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of KEY_ORDER[kind]) if (source[key] !== undefined) out[key] = source[key]
  return JSON.stringify(out)
}

export function signCover(secret: string, k: string, q: string): string {
  return createHmac('sha256', secret).update(k + q).digest('base64url').slice(0, 22)
}

export function verifyCover(secret: string, k: string, q: string, sig: string): boolean {
  const expected = Buffer.from(signCover(secret, k, q))
  const given = Buffer.from(sig)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function coverUrl(secret: string, k: CoverKind, params: CoverParams): string {
  const q = canonicalParams(k, params)
  return `/api/cover?${new URLSearchParams({ k, q, sig: signCover(secret, k, q) }).toString()}`
}
