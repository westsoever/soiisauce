import { describe, expect, test } from 'bun:test'
import isbnHit from './__fixtures__/google-books-isbn.json'
import titleHit from './__fixtures__/google-books-title.json'
import empty from './__fixtures__/google-books-empty.json'
import { cleanThumbnail, lookupGoogleBooks, UpstreamError } from './google-books'
import type { FetchLike } from './types'

function fakeFetch(routes: Array<[RegExp, unknown, number?]>): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = []
  const fetch: FetchLike = async input => {
    calls.push(input)
    const q = new URL(input).searchParams.get('q') ?? ''
    const hit = routes.find(([re]) => re.test(q))
    if (!hit) return new Response(JSON.stringify(empty), { status: 200 })
    return new Response(JSON.stringify(hit[1]), { status: hit[2] ?? 200 })
  }
  return { fetch, calls }
}

describe('cleanThumbnail', () => {
  test('upgrades http to https and strips edge=curl', () => {
    expect(
      cleanThumbnail('http://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api')
    ).toBe('https://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1&source=gbs_api')
    expect(cleanThumbnail('http://books.google.com/books/content?edge=curl&id=X')).toBe(
      'https://books.google.com/books/content?id=X'
    )
    expect(cleanThumbnail('https://books.google.com/books/content?id=X')).toBe('https://books.google.com/books/content?id=X')
  })
})

describe('lookupGoogleBooks', () => {
  test('isbn query first, cleaned thumbnail', async () => {
    const { fetch, calls } = fakeFetch([[/^isbn:9780060512750$/, isbnHit]])
    const url = await lookupGoogleBooks({ isbn: '9780060512750', title: 'The Dispossessed' }, { fetch })
    expect(url).toBe(
      'https://books.google.com/books/content?id=9jA9AQAAIAAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api'
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toStartWith('https://www.googleapis.com/books/v1/volumes?')
  })

  test('book without isbn uses intitle + inauthor and skips items without imageLinks', async () => {
    const { fetch, calls } = fakeFetch([[/^intitle:Piranesi inauthor:Susanna Clarke$/, titleHit]])
    const url = await lookupGoogleBooks({ title: 'Piranesi', author: 'Susanna Clarke' }, { fetch })
    expect(url).toContain('id=pIr4n3s1')
    expect(calls).toHaveLength(1)
  })

  test('isbn with no results falls back to the title search', async () => {
    const { fetch, calls } = fakeFetch([[/intitle:Piranesi/, titleHit]])
    const url = await lookupGoogleBooks({ isbn: '0000000000', title: 'Piranesi' }, { fetch })
    expect(url).toContain('id=pIr4n3s1')
    expect(calls).toHaveLength(2)
  })

  test('title only, no author', async () => {
    const { fetch, calls } = fakeFetch([[/intitle:Piranesi/, titleHit]])
    await lookupGoogleBooks({ title: 'Piranesi' }, { fetch })
    expect(new URL(calls[0]).searchParams.get('q')).toBe('intitle:Piranesi')
  })

  test('double quotes in titles are stripped from the query', async () => {
    const { fetch, calls } = fakeFetch([])
    await lookupGoogleBooks({ title: 'The "Real" Thing', author: 'O’Brien' }, { fetch })
    const q = new URL(calls[0]).searchParams.get('q')!
    expect(q).toBe('intitle:The Real Thing inauthor:O’Brien')
  })

  test('no results anywhere → null', async () => {
    const { fetch } = fakeFetch([])
    expect(await lookupGoogleBooks({ isbn: '1', title: 'Nope' }, { fetch })).toBeNull()
  })

  test('api key is passed when present', async () => {
    const { fetch, calls } = fakeFetch([[/^isbn:/, isbnHit]])
    await lookupGoogleBooks({ isbn: '9780060512750', title: 'x' }, { fetch, apiKey: 'K123' })
    expect(new URL(calls[0]).searchParams.get('key')).toBe('K123')
  })

  test('non-2xx throws UpstreamError', async () => {
    const { fetch } = fakeFetch([[/^isbn:/, { error: 'rate' }, 429]])
    await expect(lookupGoogleBooks({ isbn: '9780060512750', title: 'x' }, { fetch })).rejects.toBeInstanceOf(UpstreamError)
  })
})
