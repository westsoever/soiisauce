// SOII_OFFLINE=1: soii itself contacts nothing outside this machine (docs/privacy.md).
import { describe, expect, test } from 'bun:test'
import { FALLBACK_RATES } from '../lib/currency'
import { createSoiiApp } from './app'
import { coverUrl } from './covers/sign'
import { readEnv, SIGNING_SECRET } from './env'
import { makeGeneratedFixture } from './test-fixture'

const dir = makeGeneratedFixture()
const HOST = { headers: { Host: 'localhost:5011' } }

function offlineApp() {
  const calls: string[] = []
  const app = createSoiiApp({
    env: { SOII_LOCAL: '1', VAULT_PATH: '/tmp/none', SOII_OFFLINE: '1' },
    generatedDir: dir,
    fetch: async input => {
      calls.push(String(input))
      return new Response('{}')
    },
    git: async () => {
      calls.push('git')
      return { code: 0, out: '' }
    }
  })
  return { app, calls }
}

describe('offline mode', () => {
  test('SOII_OFFLINE=1 is read as offline, anything else is not', () => {
    expect(readEnv({ SOII_OFFLINE: '1' }).offline).toBe(true)
    expect(readEnv({}).offline).toBe(false)
    expect(readEnv({ SOII_OFFLINE: '0' }).offline).toBe(false)
  })

  test('exchange rates come from the built-in table, without asking anyone', async () => {
    const { app, calls } = offlineApp()
    const res = await app.request('http://localhost:5011/api/rates', HOST)
    expect(await res.json()).toEqual(FALLBACK_RATES)
    expect(calls).toEqual([])
  })

  test('covers are not looked up: books, movies and videos fall back to the title tile', async () => {
    const { app, calls } = offlineApp()
    for (const url of [
      coverUrl(SIGNING_SECRET, 'book', { title: 'Dune', author: 'Frank Herbert' }),
      coverUrl(SIGNING_SECRET, 'movie', { title: 'Alien', year: 1979 }),
      coverUrl(SIGNING_SECRET, 'video', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    ]) {
      const res = await app.request(`http://localhost:5011${url}`, HOST)
      expect(res.status).toBe(404)
      expect(res.headers.get('location')).toBeNull()
    }
    expect(calls).toEqual([])
  })

  test('no check for a newer soii', async () => {
    const { app, calls } = offlineApp()
    const res = await app.request('http://localhost:5011/api/version', HOST)
    expect(await res.json()).toEqual({ installed: null, latest: null, updateAvailable: false, releaseUrl: null })
    await Bun.sleep(50)
    expect(calls).toEqual([])
  })
})
