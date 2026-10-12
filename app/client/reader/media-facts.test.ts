import { describe, expect, test } from 'bun:test'
import type { NoteMeta } from '../../lib/types'
import { MEDIA_HIDE_FIELDS, MEDIA_TYPES, mediaFacts, safeHttpUrl } from './media-facts'

function note(type: string, frontmatter: Record<string, unknown>): NoteMeta {
  return {
    id: 'n', title: 'T', path: 'n.md', folder: '', type, tags: [], date: null, updated: null,
    frontmatter, excerpt: '', image: null, wordCount: 0
  }
}

test('MEDIA_TYPES', () => {
  expect([...MEDIA_TYPES].sort()).toEqual(['audiobook', 'book', 'documentary', 'movie', 'research', 'video'])
  expect(MEDIA_HIDE_FIELDS).toContain('isbn')
  expect(MEDIA_HIDE_FIELDS).not.toContain('started')
})

describe('mediaFacts', () => {
  test('book', () => {
    expect(mediaFacts(note('book', { author: 'Le Guin', year: 1974, status: 'finished', rating: 5, isbn: '978-0-06-051275-0' }))).toEqual({
      creator: 'Le Guin',
      year: '1974',
      status: 'finished',
      rating: 5,
      links: [{ label: 'Google Books', href: 'https://www.google.com/search?tbm=bks&q=isbn:9780060512750' }]
    })
  })
  test('audiobook narrator', () => {
    expect(mediaFacts(note('audiobook', { author: 'Clarke', narrator: 'Chiwetel Ejiofor' })).creator).toBe(
      'Clarke · read by Chiwetel Ejiofor'
    )
  })
  test('movie / video creators and Watch link', () => {
    expect(mediaFacts(note('movie', { director: 'Mann' })).creator).toBe('Mann')
    const v = mediaFacts(note('video', { channel: '3Blue1Brown', url: 'https://youtu.be/dQw4w9WgXcQ' }))
    expect(v.creator).toBe('3Blue1Brown')
    expect(v.links).toEqual([{ label: 'Watch', href: 'https://youtu.be/dQw4w9WgXcQ' }])
  })
  test('research links: doi and arxiv normalised', () => {
    const r = mediaFacts(
      note('research', {
        authors: ['Vaswani', 'Shazeer'],
        url: 'https://example.org/paper',
        doi: 'https://doi.org/10.48550/arXiv.1706.03762',
        arxiv: 'arXiv:1706.03762v7'
      })
    )
    expect(r.creator).toBe('Vaswani, Shazeer')
    expect(r.links).toEqual([
      { label: 'Open link', href: 'https://example.org/paper' },
      { label: 'DOI', href: 'https://doi.org/10.48550/arXiv.1706.03762' },
      { label: 'arXiv', href: 'https://arxiv.org/abs/1706.03762v7' }
    ])
  })
  test('unsafe and malformed links are dropped', () => {
    const r = mediaFacts(note('research', { url: 'javascript:alert(1)', doi: 'not-a-doi', arxiv: '../../etc', isbn: '123' }))
    expect(r.links).toEqual([])
  })
})

test('safeHttpUrl', () => {
  expect(safeHttpUrl('https://a.test/x')).toBe('https://a.test/x')
  expect(safeHttpUrl('http://a.test')).toBe('http://a.test/')
  expect(safeHttpUrl('data:text/html,hi')).toBeNull()
  expect(safeHttpUrl('JavaScript:alert(1)')).toBeNull()
  expect(safeHttpUrl('/relative')).toBeNull()
  expect(safeHttpUrl(42)).toBeNull()
})
