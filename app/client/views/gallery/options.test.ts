import { describe, expect, test } from 'bun:test'
import type { NoteMeta } from '../../../lib/types'
import { fieldText, groupNotes, parseGalleryOptions, resolveCard, tabAspect, typeDefaults } from './options'

function note(p: Partial<NoteMeta> & { frontmatter?: Record<string, unknown> }): NoteMeta {
  return {
    id: p.id ?? 'n',
    title: 'T',
    path: 'n.md',
    folder: '',
    type: null,
    tags: [],
    date: null,
    updated: null,
    frontmatter: {},
    excerpt: '',
    image: null,
    wordCount: 0,
    ...p
  }
}

describe('parseGalleryOptions', () => {
  test('accepts undefined and valid options', () => {
    expect(parseGalleryOptions(undefined)).toEqual({ ok: true, options: {} })
    expect(parseGalleryOptions({ aspect: 'video', groupBy: 'status' })).toEqual({
      ok: true,
      options: { aspect: 'video', groupBy: 'status' }
    })
  })
  test('names the bad option', () => {
    const r = parseGalleryOptions({ aspect: 'wide' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.issues[0].path).toEqual(['aspect'])
  })
  test('rejects unknown keys (typos)', () => {
    const r = parseGalleryOptions({ subtitel: 'author' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.issues[0].message).toContain('subtitel')
  })
})

describe('typeDefaults / tabAspect', () => {
  test('per-type defaults', () => {
    expect(typeDefaults('book')).toEqual({ aspect: 'poster', subtitle: 'author', badge: 'status' })
    expect(typeDefaults('audiobook')).toEqual({ aspect: 'poster', subtitle: 'author', badge: 'status' })
    expect(typeDefaults('movie')).toEqual({ aspect: 'poster', subtitle: 'year' })
    expect(typeDefaults('documentary')).toEqual({ aspect: 'poster', subtitle: 'year' })
    expect(typeDefaults('video')).toEqual({ aspect: 'video', subtitle: 'channel' })
    expect(typeDefaults('person')).toEqual({ aspect: 'square' })
    expect(typeDefaults(null)).toEqual({ aspect: 'square' })
  })
  test('tab aspect from option, else majority type, else poster', () => {
    expect(tabAspect({ aspect: 'square' }, [note({ type: 'video' })])).toBe('square')
    expect(tabAspect({}, [note({ type: 'video' }), note({ type: 'video' }), note({ type: 'book' })])).toBe('video')
    expect(tabAspect({}, [])).toBe('poster')
  })
})

describe('fieldText', () => {
  const n = note({
    title: 'Dune',
    date: '2026-01-02',
    frontmatter: { author: '  Frank Herbert ', year: 1965, owned: true, authors: ['A', '', 'B', 3], blank: '', obj: { a: 1 } }
  })
  test.each([
    ['title', 'Dune'],
    ['date', '2026-01-02'],
    ['author', 'Frank Herbert'],
    ['year', '1965'],
    ['owned', 'Yes'],
    ['authors', 'A, B, 3'],
    ['blank', null],
    ['obj', null],
    ['missing', null]
  ])('%s → %p', (field, expected) => {
    expect(fieldText(n, field)).toBe(expected as string | null)
  })
})

describe('resolveCard', () => {
  test('book defaults: author subtitle, status badge, decorated image, rating rounding', () => {
    const card = resolveCard(
      note({ id: 'b', type: 'book', title: 'Dune', image: '/api/cover?k=book', frontmatter: { author: 'Herbert', status: 'reading', rating: 4.3 } }),
      {}
    )
    expect(card).toEqual({ id: 'b', title: 'Dune', subtitle: 'Herbert', badge: 'reading', image: '/api/cover?k=book', rating: 4.5 })
  })
  test('options override; image option must be http(s) or /api/', () => {
    const n = note({ type: 'book', frontmatter: { cover_url: 'javascript:alert(1)', alt: 'https://x.test/c.jpg', who: 'W', st: 'S' } })
    expect(resolveCard(n, { image: 'cover_url' }).image).toBeNull()
    expect(resolveCard(n, { image: 'alt', subtitle: 'who', badge: 'st' })).toMatchObject({
      image: 'https://x.test/c.jpg',
      subtitle: 'W',
      badge: 'S'
    })
  })
  test('rating clamps and ignores junk', () => {
    expect(resolveCard(note({ frontmatter: { rating: 9 } }), {}).rating).toBe(5)
    expect(resolveCard(note({ frontmatter: { rating: -2 } }), {}).rating).toBe(0)
    expect(resolveCard(note({ frontmatter: { rating: 'great' } }), {}).rating).toBeNull()
    expect(resolveCard(note({}), {}).rating).toBeNull()
  })
})

describe('groupNotes', () => {
  test('first-appearance order, case-insensitive keys, missing last, arrays by first value', () => {
    const notes = [
      note({ id: '1', frontmatter: { status: 'Reading' } }),
      note({ id: '2', frontmatter: {} }),
      note({ id: '3', frontmatter: { status: 'finished' } }),
      note({ id: '4', frontmatter: { status: 'reading' } }),
      note({ id: '5', frontmatter: { status: ['finished', 'reading'] } })
    ]
    const groups = groupNotes(notes, 'status')
    expect(groups.map(g => [g.key, g.label, g.notes.map(n => n.id)])).toEqual([
      ['reading', 'Reading', ['1', '4']],
      ['finished', 'finished', ['3', '5']],
      ['', 'No status', ['2']]
    ])
  })
})
