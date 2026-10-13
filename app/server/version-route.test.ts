import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSoiiApp } from './app'
import { makeGeneratedFixture } from './test-fixture'
import type { VersionChecker } from './version'

const dir = makeGeneratedFixture()
const INFO = { installed: 'v0.1.2', latest: 'v0.1.3', updateAvailable: true, releaseUrl: 'https://github.com/westsoever/soiisauce/releases/tag/v0.1.3' }

function fakeChecker() {
  const calls = { started: 0, refreshed: 0 }
  const checker: VersionChecker = {
    info: () => INFO,
    ensureStarted: () => void calls.started++,
    refresh: async () => void calls.refreshed++,
    stop: () => {}
  }
  return { checker, calls }
}

describe('GET /api/version', () => {
  test('in local mode it returns the installed and latest version and starts the checks', async () => {
    const { checker, calls } = fakeChecker()
    const app = createSoiiApp({ env: { SOII_LOCAL: '1', VAULT_PATH: '/tmp/none' }, generatedDir: dir, version: checker })
    const res = await app.request('http://localhost:5011/api/version', { headers: { Host: 'localhost:5011' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(INFO)
    expect(calls.started).toBe(1)
  })

  test('outside local mode there is nothing to update from here: no check, no notice', async () => {
    const { checker, calls } = fakeChecker()
    const app = createSoiiApp({ env: {}, generatedDir: dir, version: checker })
    const res = await app.request('http://localhost:13390/api/version')
    expect(await res.json()).toEqual({ installed: null, latest: null, updateAvailable: false, releaseUrl: null })
    expect(calls.started).toBe(0)
  })

  test('the installed version comes from SOII_VERSION when no checker is injected, and no git runs until asked', async () => {
    const app = createSoiiApp({ env: { SOII_LOCAL: '1', SOII_VERSION: '0.1.2', VAULT_PATH: '/tmp/none' }, generatedDir: dir, git: async () => ({ code: 128, out: 'offline' }) })
    const res = await app.request('http://localhost:5011/api/version', { headers: { Host: 'localhost:5011' } })
    expect(await res.json()).toMatchObject({ installed: 'v0.1.2', updateAvailable: false })
  })
})

describe('POST /api/sync checks for a newer release right after it completes', () => {
  function sync(env: Record<string, string>, checker: VersionChecker, pull: { code: number; out: string }) {
    const vault = mkdtempSync(join(tmpdir(), 'soii-vsync-'))
    mkdirSync(join(vault, '.git'))
    const app = createSoiiApp({ env: { ...env, VAULT_PATH: vault }, generatedDir: dir, version: checker, git: async (_cwd, args) => (args[0] === 'pull' ? pull : { code: 0, out: '' }) })
    return app.fetch(new Request('http://localhost:5011/api/sync', { method: 'POST', headers: { Host: 'localhost:5011', Origin: 'http://localhost:5011' } }))
  }

  test('in local mode a finished Sync refreshes the check, so the notice is current when Sync returns', async () => {
    const { checker, calls } = fakeChecker()
    const res = await sync({ SOII_LOCAL: '1' }, checker, { code: 0, out: 'Already up to date.' })
    expect(res.status).toBe(200)
    expect(calls.refreshed).toBe(1)
  })

  test('a Sync that failed does not check', async () => {
    const { checker, calls } = fakeChecker()
    const res = await sync({ SOII_LOCAL: '1' }, checker, { code: 1, out: 'fatal: Not possible to fast-forward' })
    expect(res.status).toBe(409)
    expect(calls.refreshed).toBe(0)
  })

  test('outside local mode there is nothing to check', async () => {
    const { checker, calls } = fakeChecker()
    const res = await sync({}, checker, { code: 0, out: 'Already up to date.' })
    expect(res.status).toBe(200)
    expect(calls.refreshed).toBe(0)
  })

  test('a slow or failing check never holds Sync up for more than a moment', async () => {
    const slow: VersionChecker = { info: () => INFO, ensureStarted: () => {}, refresh: () => new Promise(() => {}), stop: () => {} }
    const started = Date.now()
    const res = await sync({ SOII_LOCAL: '1' }, slow, { code: 0, out: 'Already up to date.' })
    expect(res.status).toBe(200)
    expect(Date.now() - started).toBeLessThan(5000)
  })
})
