import { describe, expect, test } from 'bun:test'
import hit from './__fixtures__/tmdb-search.json'
import empty from './__fixtures__/tmdb-empty.json'
import { lookupTmdb } from './tmdb'
import { UpstreamError } from './google-books'
import type { FetchLike } from './types'

function recorder(responder: (url: string) => [unknown, number?]): { fetch: FetchLike; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init })
    const [body, status] = responder(url)
    return new Response(JSON.stringify(body), { status: status ?? 200 })
  }
  return { fetch, calls }
}

describe('lookupTmdb', () => {
  test('no api key → null without any network call', async () => {
    const { fetch, calls } = recorder(() => [hit])
    expect(await lookupTmdb({ title: 'The Matrix', year: 1999 }, { fetch, apiKey: '' })).toBeNull()
    expect(await lookupTmdb({ title: 'The Matrix' }, { fetch })).toBeNull()
    expect(calls).toHaveLength(0)
  })

  test('v3 key goes in api_key; first result with a poster wins', async () => {
    const { fetch, calls } = recorder(() => [hit])
    const url = await lookupTmdb({ title: 'The Matrix', year: 1999 }, { fetch, apiKey: 'abc123' })
    expect(url).toBe('https://image.tmdb.org/t/p/w342/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg')
    const u = new URL(calls[0].url)
    expect(u.origin + u.pathname).toBe('https://api.themoviedb.org/3/search/movie')
    expect(u.searchParams.get('query')).toBe('The Matrix')
    expect(u.searchParams.get('year')).toBe('1999')
    expect(u.searchParams.get('api_key')).toBe('abc123')
    expect(u.searchParams.get('include_adult')).toBe('false')
  })

  test('v4 read token (JWT) goes in the Authorization header', async () => {
    const { fetch, calls } = recorder(() => [hit])
    await lookupTmdb({ title: 'The Matrix' }, { fetch, apiKey: 'eyJhbGciOiJIUzI1NiJ9.x.y' })
    expect(new URL(calls[0].url).searchParams.get('api_key')).toBeNull()
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.x.y')
  })

  test('no poster with the year → retries once without the year', async () => {
    const { fetch, calls } = recorder(url => [new URL(url).searchParams.has('year') ? empty : hit])
    const url = await lookupTmdb({ title: 'The Matrix', year: 2001 }, { fetch, apiKey: 'k' })
    expect(url).toContain('/w342/')
    expect(calls).toHaveLength(2)
  })

  test('nothing found → null', async () => {
    const { fetch } = recorder(() => [empty])
    expect(await lookupTmdb({ title: 'Zzz' }, { fetch, apiKey: 'k' })).toBeNull()
  })

  test('non-2xx → UpstreamError', async () => {
    const { fetch } = recorder(() => [{ status_message: 'Invalid API key' }, 401])
    await expect(lookupTmdb({ title: 'X' }, { fetch, apiKey: 'bad' })).rejects.toBeInstanceOf(UpstreamError)
  })
})
