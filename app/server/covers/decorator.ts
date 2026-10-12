// Gives media notes without an image a signed /api/cover URL (spec §11).
// Registered in app/server/decorate.ts; runs per request on /api/vault and
// /api/notes/*.
import type { DecorateCtx, NoteDecorator, NoteMeta } from '../../lib/types'
import { coverUrl } from './sign'
import type { CoverKind, CoverParams } from './types'
import { parseYouTubeId } from './youtube'

const KIND_BY_TYPE: Record<string, CoverKind> = {
  book: 'book',
  audiobook: 'book',
  movie: 'movie',
  documentary: 'movie',
  video: 'video'
}

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (Array.isArray(v)) return v.map(firstString).find(Boolean)
  return undefined
}

function normaliseIsbn(v: unknown): string | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined
  const s = String(v).replace(/[^0-9Xx]/g, '').toUpperCase()
  return s.length === 10 || s.length === 13 ? s : undefined
}

function yearOf(fm: Record<string, unknown>): number | undefined {
  const direct = Number(typeof fm.year === 'string' ? fm.year.trim() : fm.year)
  if (Number.isInteger(direct) && direct >= 1870 && direct <= 2100) return direct
  for (const key of ['released', 'release_date']) {
    const m = typeof fm[key] === 'string' ? /^(\d{4})/.exec(fm[key] as string) : null
    if (m) return Number(m[1])
  }
  return undefined
}

export function coverRequestFor(note: NoteMeta): { k: CoverKind; params: CoverParams } | null {
  const k = note.type ? KIND_BY_TYPE[note.type] : undefined
  if (!k) return null
  const fm = note.frontmatter
  if (k === 'video') {
    const url = typeof fm.url === 'string' ? fm.url.trim() : ''
    return url && parseYouTubeId(url) ? { k, params: { url } } : null
  }
  if (k === 'movie') {
    const year = yearOf(fm)
    return { k, params: year === undefined ? { title: note.title } : { title: note.title, year } }
  }
  const params: { isbn?: string; title: string; author?: string } = { title: note.title }
  const isbn = normaliseIsbn(fm.isbn)
  if (isbn) params.isbn = isbn
  const author = firstString(fm.author)
  if (author) params.author = author
  return { k, params }
}

export const coverDecorator: NoteDecorator = (note: NoteMeta, ctx: DecorateCtx): NoteMeta => {
  if (note.image || !ctx.secret) return note
  const request = coverRequestFor(note)
  if (!request) return note
  return { ...note, image: coverUrl(ctx.secret, request.k, request.params) }
}
