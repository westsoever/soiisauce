import { describe, expect, test } from 'bun:test'
import type { NoteMeta } from '../../lib/types'
import { coverDecorator, coverRequestFor } from './decorator'
import { verifyCover } from './sign'

const SECRET = 'q'.repeat(40)
const ctx = { secret: SECRET, origin: 'https://soii.test' }

function note(partial: Partial<NoteMeta> & { frontmatter?: Record<string, unknown> }): NoteMeta {
  return {
    id: 'x',
    title: 'Untitled',
    path: 'x.md',
    folder: '',
    type: null,
    tags: [],
    date: null,
    updated: null,
    frontmatter: {},
    excerpt: '',
    image: null,
    wordCount: 0,
    ...partial
  }
}

describe('coverRequestFor', () => {
  test('book with isbn normalises the isbn', () => {
    const r = coverRequestFor(note({ type: 'book', title: 'Dune', frontmatter: { isbn: '978-0-441-17271-9', author: 'Frank Herbert' } }))
    expect(r).toEqual({ k: 'book', params: { isbn: '9780441172719', title: 'Dune', author: 'Frank Herbert' } })
  })
  test('book without isbn still gets a request (title + author)', () => {
    expect(coverRequestFor(note({ type: 'book', title: 'Piranesi', frontmatter: { author: ['Susanna Clarke', 'X'] } }))).toEqual({
      k: 'book',
      params: { title: 'Piranesi', author: 'Susanna Clarke' }
    })
  })
  test('book with a numeric isbn and an invalid isbn', () => {
    expect(coverRequestFor(note({ type: 'book', title: 'A', frontmatter: { isbn: 9780441172719 } }))?.params).toEqual({
      isbn: '9780441172719',
      title: 'A'
    })
    expect(coverRequestFor(note({ type: 'book', title: 'A', frontmatter: { isbn: '12345' } }))?.params).toEqual({ title: 'A' })
    expect(coverRequestFor(note({ type: 'book', title: 'A', frontmatter: { isbn: '0-8044-2957-x' } }))?.params).toEqual({
      isbn: '080442957X',
      title: 'A'
    })
  })
  test('audiobook maps to book kind', () => {
    expect(coverRequestFor(note({ type: 'audiobook', title: 'A' }))?.k).toBe('book')
  })
  test('movie and documentary with year handling', () => {
    expect(coverRequestFor(note({ type: 'movie', title: 'Heat', frontmatter: { year: '1995' } }))).toEqual({
      k: 'movie',
      params: { title: 'Heat', year: 1995 }
    })
    expect(coverRequestFor(note({ type: 'documentary', title: 'Free Solo', frontmatter: { released: '2018-09-28' } }))).toEqual({
      k: 'movie',
      params: { title: 'Free Solo', year: 2018 }
    })
    expect(coverRequestFor(note({ type: 'movie', title: 'X', frontmatter: { year: 'soon' } }))?.params).toEqual({ title: 'X' })
  })
  test('video only for youtube urls', () => {
    expect(coverRequestFor(note({ type: 'video', title: 'V', frontmatter: { url: 'https://youtu.be/dQw4w9WgXcQ' } }))).toEqual({
      k: 'video',
      params: { url: 'https://youtu.be/dQw4w9WgXcQ' }
    })
    expect(coverRequestFor(note({ type: 'video', title: 'V', frontmatter: { url: 'https://vimeo.com/1' } }))).toBeNull()
    expect(coverRequestFor(note({ type: 'video', title: 'V' }))).toBeNull()
  })
  test('other types → null', () => {
    expect(coverRequestFor(note({ type: 'research', title: 'R' }))).toBeNull()
    expect(coverRequestFor(note({ type: null, title: 'R' }))).toBeNull()
  })
})

describe('coverDecorator', () => {
  test('sets a signed /api/cover URL when image is null', () => {
    const out = coverDecorator(note({ type: 'book', title: 'Ægir’s "Saga"' }), ctx)
    expect(out.image).toStartWith('/api/cover?')
    const sp = new URL(out.image!, ctx.origin).searchParams
    expect(verifyCover(SECRET, sp.get('k')!, sp.get('q')!, sp.get('sig')!)).toBe(true)
  })
  test('keeps an existing image', () => {
    const n = note({ type: 'book', title: 'A', image: 'https://example.com/c.jpg' })
    expect(coverDecorator(n, ctx)).toBe(n)
  })
  test('no secret → unchanged', () => {
    const n = note({ type: 'book', title: 'A' })
    expect(coverDecorator(n, { secret: '', origin: '' })).toBe(n)
  })
  test('does not mutate its input', () => {
    const n = note({ type: 'book', title: 'A' })
    coverDecorator(n, ctx)
    expect(n.image).toBeNull()
  })
})
