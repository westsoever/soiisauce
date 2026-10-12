import { describe, expect, test } from 'bun:test'
import { canonicalParams, coverUrl, isCoverKind, signCover, verifyCover } from './sign'

const SECRET = 'x'.repeat(40)

describe('canonicalParams', () => {
  test('fixed key order, undefined dropped', () => {
    expect(canonicalParams('book', { author: 'Le Guin', title: 'The Dispossessed', isbn: undefined })).toBe(
      '{"title":"The Dispossessed","author":"Le Guin"}'
    )
    expect(canonicalParams('book', { title: 'A', isbn: '9780060512750', author: 'B' })).toBe(
      '{"isbn":"9780060512750","title":"A","author":"B"}'
    )
    expect(canonicalParams('movie', { year: 1999, title: 'The Matrix' })).toBe('{"title":"The Matrix","year":1999}')
    expect(canonicalParams('video', { url: 'https://youtu.be/dQw4w9WgXcQ' })).toBe(
      '{"url":"https://youtu.be/dQw4w9WgXcQ"}'
    )
  })
})

describe('signCover / verifyCover', () => {
  test('signature is 22 base64url chars', () => {
    const sig = signCover(SECRET, 'book', '{"title":"A"}')
    expect(sig).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
  test('verifies its own signature and rejects tampering', () => {
    const q = '{"title":"A"}'
    const sig = signCover(SECRET, 'book', q)
    expect(verifyCover(SECRET, 'book', q, sig)).toBe(true)
    expect(verifyCover(SECRET, 'movie', q, sig)).toBe(false)
    expect(verifyCover(SECRET, 'book', '{"title":"B"}', sig)).toBe(false)
    expect(verifyCover('y'.repeat(40), 'book', q, sig)).toBe(false)
    expect(verifyCover(SECRET, 'book', q, '')).toBe(false)
    expect(verifyCover(SECRET, 'book', q, sig.slice(0, 21))).toBe(false)
    expect(verifyCover(SECRET, 'book', q, sig + 'A')).toBe(false)
  })
})

describe('coverUrl', () => {
  test('unicode, quotes and URL-special characters round-trip through URLSearchParams', () => {
    const params = { title: 'Ægir’s "Saga" & Co. #1 + 2 — 東京', author: 'Ø. Brønd?' }
    const url = coverUrl(SECRET, 'book', params)
    expect(url.startsWith('/api/cover?')).toBe(true)
    const sp = new URL(url, 'https://soii.test').searchParams
    expect(sp.get('k')).toBe('book')
    expect(JSON.parse(sp.get('q')!)).toEqual(params)
    expect(verifyCover(SECRET, sp.get('k')!, sp.get('q')!, sp.get('sig')!)).toBe(true)
  })
})

test('isCoverKind', () => {
  expect(isCoverKind('book')).toBe(true)
  expect(isCoverKind('movie')).toBe(true)
  expect(isCoverKind('video')).toBe(true)
  expect(isCoverKind('audiobook')).toBe(false)
  expect(isCoverKind('')).toBe(false)
})
