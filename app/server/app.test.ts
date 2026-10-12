// Tests for the vault routes over a hand-built compiled vault (spec §6.3, §8).
import { afterEach, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'
import type { NoteMeta } from '../lib/types'
import { createSoiiApp } from './app'
import { createSessionToken } from './auth'
import { decorators } from './decorate'
import { makeGeneratedFixture } from './test-fixture'

const SECRET = 's'.repeat(40)
const ENV = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'csec', SOII_ALLOWED_GITHUB_LOGINS: 'octo', SOII_SESSION_SECRET: SECRET }
const NOW = 1_800_000_000_000
const dir = makeGeneratedFixture()
const app = createSoiiApp({ env: ENV, generatedDir: dir, now: () => NOW })
const token = await createSessionToken({ login: 'octo', avatarUrl: null }, SECRET, NOW / 1000)
const authed = { headers: { Cookie: `soii_session=${token}` } }
const get = (path: string, init: RequestInit = authed) => app.request(`https://soii.test${path}`, init)

afterEach(() => {
  decorators.length = 0
})

const PROTECTED = ['/api/me', '/api/vault', '/api/notes/People/Anna', '/api/search?q=anna', '/api/files/assets/pic.png']

describe('protected routes', () => {
  for (const path of PROTECTED) {
    test(`${path} is 401 without a session`, async () => {
      const res = await get(path, { headers: {} })
      expect(res.status).toBe(401)
    })
    test(`${path} works with a session`, async () => {
      expect((await get(path)).status).toBe(200)
    })
  }
})

describe('vault routes', () => {
  test('health reports build meta without content', async () => {
    const body = await (await get('/api/health', { headers: {} })).json()
    expect(body).toEqual({ ok: true, commit: 'def5678', vaultCommit: 'abc1234', builtAt: '2026-10-11T20:00:00.000Z' })
  })

  test('/api/vault returns the index', async () => {
    const body = await (await get('/api/vault')).json()
    expect(body.notes.map((n: NoteMeta) => n.id)).toEqual(['People/Anna', 'Weird/Café & ? 100%'])
    expect(body.config.home).toBe('today')
  })

  test('note by encoded unicode id; 404 for unknown and malformed ids', async () => {
    const ok = await get('/api/notes/Weird/Caf%C3%A9%20%26%20%3F%20100%25')
    expect(ok.status).toBe(200)
    expect((await ok.json()).html).toBe('<p>unicode body</p>')
    expect((await get('/api/notes/Nope')).status).toBe(404)
    expect(await (await get('/api/notes/Nope')).json()).toEqual({ error: 'not_found' })
    expect((await get('/api/notes/bad%E0%A4%A')).status).toBe(404)
  })

  test('search: results with snippet; empty query → []', async () => {
    const body = await (await get('/api/search?q=walks')).json()
    expect(body.results[0]).toMatchObject({ id: 'People/Anna', title: 'Anna', path: 'People/Anna.md' })
    expect(body.results[0].snippet).toContain('walks')
    expect(await (await get('/api/search?q=%20')).json()).toEqual({ results: [] })
  })

  test('files: content type, private cache, sandboxed', async () => {
    const res = await get('/api/files/assets/pic.png')
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600')
    const svg = await get('/api/files/assets/evil.svg')
    expect(svg.headers.get('content-security-policy')).toContain('sandbox')
  })

  test('files: traversal and unknown paths are 404', async () => {
    for (const path of [
      '/api/files/../index.json',
      '/api/files/%2e%2e/index.json',
      '/api/files/%2E%2E%2Findex.json',
      '/api/files/assets/..%2F..%2Findex.json',
      '/api/files/assets/..%2f..%2fmeta.json',
      '/api/files/assets%2F..%2F..%2Findex.json',
      '/api/files/..%2f..%2fetc/passwd',
      '/api/files//etc/passwd',
      '/api/files/%2Fetc%2Fpasswd',
      '/api/files/assets/..%5C..%5Cindex.json',
      '/api/files/assets/pic.png%00',
      '/api/files/assets/%00../index.json',
      '/api/files/index.json',
      '/api/files/notes',
      '/api/files/assets',
      '/api/files/assets/missing.png',
      '/api/files/bad%E0%A4%A'
    ]) {
      const res = await get(path)
      expect(res.status, path).toBe(404)
    }
  })

  test('decorators run on /api/vault and /api/notes', async () => {
    decorators.push((note, ctx) => ({ ...note, image: `${ctx.origin}/img/${note.id}` }))
    const vault = await (await get('/api/vault')).json()
    expect(vault.notes[0].image).toBe('https://soii.test/img/People/Anna')
    const note = await (await get('/api/notes/People/Anna')).json()
    expect(note.image).toBe('https://soii.test/img/People/Anna')
    expect(note.html).toBe('<p>Partner who likes long walks.</p>')
  })

  test('unknown api path → 404 JSON; no compiled vault → 503 not_built', async () => {
    expect(await (await get('/api/nope')).json()).toEqual({ error: 'not_found' })
    const empty = createSoiiApp({ env: ENV, generatedDir: '/nonexistent/soii', now: () => NOW })
    const res = await empty.request('https://soii.test/api/vault', authed)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_built' })
  })
})

process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
