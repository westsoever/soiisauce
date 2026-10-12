// What the media header shows for books, audiobooks, movies, documentaries,
// videos and research (spec §11). Links are http(s) only and identifiers are validated.
import type { NoteMeta } from '../../lib/types'
import { fieldText, resolveCard } from '../views/gallery/options'

export const MEDIA_TYPES: ReadonlySet<string> = new Set(['book', 'audiobook', 'movie', 'documentary', 'video', 'research'])

export const MEDIA_HIDE_FIELDS = [
  'title', 'author', 'authors', 'director', 'channel', 'narrator', 'year', 'status', 'rating',
  'url', 'doi', 'arxiv', 'isbn', 'cover', 'image', 'poster', 'thumbnail'
]

export type MediaLink = { label: string; href: string }
export type MediaFacts = {
  creator: string | null
  year: string | null
  status: string | null
  rating: number | null
  links: MediaLink[]
}

export function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

const DOI = /^10\.\d{4,9}\/\S+$/
const ARXIV = /^(\d{4}\.\d{4,5}(v\d+)?|[a-z-]+(\.[A-Z]{2})?\/\d{7}(v\d+)?)$/

function creatorOf(note: NoteMeta): string | null {
  switch (note.type) {
    case 'audiobook': {
      const author = fieldText(note, 'author')
      const narrator = fieldText(note, 'narrator')
      return narrator ? `${author ?? 'Unknown'} · read by ${narrator}` : author
    }
    case 'movie':
    case 'documentary':
      return fieldText(note, 'director')
    case 'video':
      return fieldText(note, 'channel')
    case 'research':
      return fieldText(note, 'authors') ?? fieldText(note, 'author')
    default:
      return fieldText(note, 'author')
  }
}

export function mediaFacts(note: NoteMeta): MediaFacts {
  const fm = note.frontmatter
  const links: MediaLink[] = []
  const url = safeHttpUrl(fm.url)
  if (url) links.push({ label: note.type === 'video' ? 'Watch' : 'Open link', href: url })
  const doi = fieldText(note, 'doi')?.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, '')
  if (doi && DOI.test(doi)) links.push({ label: 'DOI', href: `https://doi.org/${doi}` })
  const arxiv = fieldText(note, 'arxiv')?.replace(/^(arxiv:|https?:\/\/arxiv\.org\/abs\/)/i, '')
  if (arxiv && ARXIV.test(arxiv)) links.push({ label: 'arXiv', href: `https://arxiv.org/abs/${arxiv}` })
  const isbn = typeof fm.isbn === 'string' || typeof fm.isbn === 'number' ? String(fm.isbn).replace(/[^0-9Xx]/g, '').toUpperCase() : ''
  if (isbn.length === 10 || isbn.length === 13) {
    links.push({ label: 'Google Books', href: `https://www.google.com/search?tbm=bks&q=isbn:${isbn}` })
  }
  return {
    creator: creatorOf(note),
    year: fieldText(note, 'year'),
    status: fieldText(note, 'status'),
    rating: resolveCard(note, {}).rating,
    links
  }
}
