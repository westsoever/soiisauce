import { describe, expect, test } from 'bun:test'
import isbnHit from './__fixtures__/google-books-isbn.json'
import empty from './__fixtures__/google-books-empty.json'
import tmdbHit from './__fixtures__/tmdb-search.json'
import { createCoverRoute, FOUND_CACHE, MISS_CACHE, NO_STORE, RATE_LIMITED_CACHE, type CoverDeps } from './route'
import { coverUrl, signCover } from './sign'
import type { FetchLike } from './types'

const SECRET = 's'.repeat(40)

function jsonFetch(body: unknown, status = 200): FetchLike & { calls: string[] } {
  const calls: string[] = []
  const f = (async (url: string) => {
    calls.push(url)
    return new Response(JSON.stringify(body), { status })
  }) as FetchLike & { calls: string[] }
  f.calls = calls
  return f
}

function app(overrides: Partial<CoverDeps> = {}) {
  return createCoverRoute({ secret: () => SECRET, fetch: jsonFetch(empty), ...overrides })
}

// The sub-app is mounted at "/", so requests go to "/?k=..."; coverUrl builds "/api/cover?...".
const local = (url: string) => url.replace('/api/cover', '/')

describe('signature gate', () => {
  test('bad signature → 403 no-store, and no upstream call', async () => {
    const fetch = jsonFetch(isbnHit)
    const res = await app({ fetch }).request('/?k=book&q=%7B%22title%22%3A%22A%22%7D&sig=AAAAAAAAAAAAAAAAAAAAAA')
    expect(res.status).toBe(403)
    expect(res.headers.get('cache-control')).toBe(NO_STORE)
    expect(fetch.calls).toHaveLength(0)
  })
  test('missing params → 403', async () => {
    expect((await app().request('/')).status).toBe(403)
  })
  test('unknown kind → 403 even if correctly signed', async () => {
    const q = '{"title":"A"}'
    const res = await app().request(`/?k=podcast&q=${encodeURIComponent(q)}&sig=${signCover(SECRET, 'podcast', q)}`)
    expect(res.status).toBe(403)
  })
  test('secret not configured → 403', async () => {
    const res = await app({ secret: () => undefined }).request(local(coverUrl(SECRET, 'book', { title: 'A' })))
    expect(res.status).toBe(403)
  })
  test('signed non-object q → 400', async () => {
    const q = '"just a string"'
    const res = await app().request(`/?k=book&q=${encodeURIComponent(q)}&sig=${signCover(SECRET, 'book', q)}`)
    expect(res.status).toBe(400)
  })
})

describe('lookups', () => {
  test('book found → 302 with long CDN cache', async () => {
    const res = await app({ fetch: jsonFetch(isbnHit) }).request(
      local(coverUrl(SECRET, 'book', { isbn: '9780060512750', title: 'The Dispossessed' }))
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toStartWith('https://books.google.com/books/content?id=9jA9AQAAIAAJ')
    expect(res.headers.get('cache-control')).toBe(FOUND_CACHE)
  })
  test('book with unicode/quote title and no isbn round-trips the signature', async () => {
    const fetch = jsonFetch(isbnHit)
    const res = await app({ fetch }).request(local(coverUrl(SECRET, 'book', { title: 'Ægir’s "Saga" & #1', author: 'Brønd' })))
    expect(res.status).toBe(302)
    expect(new URL(fetch.calls[0]).searchParams.get('q')).toBe('intitle:Ægir’s Saga & #1 inauthor:Brønd')
  })
  test('book not found → 404 with day-long CDN cache', async () => {
    const res = await app().request(local(coverUrl(SECRET, 'book', { title: 'Nothing' })))
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe(MISS_CACHE)
  })
  test('google key is forwarded', async () => {
    const fetch = jsonFetch(isbnHit)
    await app({ fetch, googleBooksKey: () => 'GKEY' }).request(local(coverUrl(SECRET, 'book', { isbn: '1', title: 'A' })))
    expect(new URL(fetch.calls[0]).searchParams.get('key')).toBe('GKEY')
  })
  test('movie with TMDB key → 302 poster', async () => {
    const res = await app({ fetch: jsonFetch(tmdbHit), tmdbKey: () => 'k' }).request(
      local(coverUrl(SECRET, 'movie', { title: 'The Matrix', year: 1999 }))
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://image.tmdb.org/t/p/w342/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg')
  })
  test('movie without TMDB key → 404 cached, no network', async () => {
    const fetch = jsonFetch(tmdbHit)
    const res = await app({ fetch, tmdbKey: () => undefined }).request(local(coverUrl(SECRET, 'movie', { title: 'The Matrix' })))
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe(MISS_CACHE)
    expect(fetch.calls).toHaveLength(0)
  })
  test('video → 302 to i.ytimg.com without network', async () => {
    const fetch = jsonFetch({})
    const res = await app({ fetch }).request(local(coverUrl(SECRET, 'video', { url: 'https://youtu.be/dQw4w9WgXcQ' })))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(fetch.calls).toHaveLength(0)
  })
  test('non-youtube video url → 404', async () => {
    const res = await app().request(local(coverUrl(SECRET, 'video', { url: 'https://vimeo.com/1' })))
    expect(res.status).toBe(404)
  })
  test('Google Books 429 → 502 with a 5-minute CDN cache', async () => {
    const res = await app({ fetch: jsonFetch({ error: {} }, 429) }).request(local(coverUrl(SECRET, 'book', { isbn: '1', title: 'A' })))
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300')
    expect(res.headers.get('cache-control')).toBe(RATE_LIMITED_CACHE)
    expect(await res.json()).toEqual({ error: 'upstream', status: 429 })
  })
  test('TMDB 429 → 502 with a 5-minute CDN cache', async () => {
    const res = await app({ fetch: jsonFetch({}, 429), tmdbKey: () => 'k' }).request(local(coverUrl(SECRET, 'movie', { title: 'Dune', year: 2021 })))
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe(RATE_LIMITED_CACHE)
  })
  test.each([400, 401, 403, 500, 503])('other upstream error %i → 502 no-store', async status => {
    const book = await app({ fetch: jsonFetch({ error: {} }, status) }).request(local(coverUrl(SECRET, 'book', { isbn: '1', title: 'A' })))
    expect(book.status).toBe(502)
    expect(book.headers.get('cache-control')).toBe(NO_STORE)
    const movie = await app({ fetch: jsonFetch({}, status), tmdbKey: () => 'k' }).request(local(coverUrl(SECRET, 'movie', { title: 'Dune' })))
    expect(movie.status).toBe(502)
    expect(movie.headers.get('cache-control')).toBe(NO_STORE)
  })
  test('not found keeps its day-long CDN cache', async () => {
    const res = await app().request(local(coverUrl(SECRET, 'book', { title: 'Nothing' })))
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=86400')
  })
  test('timeout → 504 no-store', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      )
    const res = await app({ fetch: hang, timeoutMs: 20 }).request(local(coverUrl(SECRET, 'book', { title: 'Slow' })))
    expect(res.status).toBe(504)
    expect(res.headers.get('cache-control')).toBe(NO_STORE)
  })
})
