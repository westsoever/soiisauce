import { describe, expect, test } from 'bun:test'
import { createSoiiApp } from './app'
import { makeGeneratedFixture } from './test-fixture'
import type { VersionChecker } from './version'

const dir = makeGeneratedFixture()
const INFO = { installed: 'v0.1.2', latest: 'v0.1.3', updateAvailable: true, releaseUrl: 'https://github.com/westsoever/soii/releases/tag/v0.1.3' }

function fakeChecker() {
  const calls = { started: 0 }
  const checker: VersionChecker = {
    info: () => INFO,
    ensureStarted: () => void calls.started++,
    refresh: async () => {},
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
    const app = createSoiiApp({ env: { SOII_DEV_AUTH: '1' }, generatedDir: dir, version: checker })
    const res = await app.request('http://localhost:13390/api/version')
    expect(await res.json()).toEqual({ installed: null, latest: null, updateAvailable: false, releaseUrl: null })
    expect(calls.started).toBe(0)
  })

  test('it needs a session like the other routes', async () => {
    const env = { GITHUB_CLIENT_ID: 'c', GITHUB_CLIENT_SECRET: 's', SOII_ALLOWED_GITHUB_LOGINS: 'octo', SOII_SESSION_SECRET: 'x'.repeat(40) }
    const app = createSoiiApp({ env, generatedDir: dir })
    expect((await app.request('https://soii.test/api/version')).status).toBe(401)
  })

  test('the installed version comes from SOII_VERSION when no checker is injected, and no git runs until asked', async () => {
    const app = createSoiiApp({ env: { SOII_LOCAL: '1', SOII_VERSION: '0.1.2', VAULT_PATH: '/tmp/none' }, generatedDir: dir, git: async () => ({ code: 128, out: 'offline' }) })
    const res = await app.request('http://localhost:5011/api/version', { headers: { Host: 'localhost:5011' } })
    expect(await res.json()).toMatchObject({ installed: 'v0.1.2', updateAvailable: false })
  })
})
