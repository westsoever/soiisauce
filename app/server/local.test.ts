// app/server/local.test.ts
// Local mode (SOII_LOCAL=1): loopback only, writes go straight to the vault.
import { describe, expect, test } from 'bun:test'
import { createSoiiApp } from './app'
import { readEnv } from './env'
import { bindProblem, hostHeaderAllowed, isLoopbackHost } from './local'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeGeneratedFixture } from './test-fixture'

describe('readEnv', () => {
  test('SOII_LOCAL=1 means local mode', () => {
    expect(readEnv({ SOII_LOCAL: '1', VAULT_PATH: '/v' })).toMatchObject({ local: true, vaultPath: '/v' })
  })

  test('without it, it is plain dev mode', () => {
    expect(readEnv({}).local).toBe(false)
  })
})

describe('isLoopbackHost', () => {
  test('127.0.0.0/8, localhost and ::1 are loopback', () => {
    for (const h of ['127.0.0.1', '127.1.2.3', 'localhost', '::1', '[::1]', 'LOCALHOST']) expect(isLoopbackHost(h)).toBe(true)
  })

  test('everything else is not', () => {
    for (const h of ['0.0.0.0', '192.168.1.5', 'soii.local', '::', '', '1270.0.0.1', '127.0.0.1.evil.com']) expect(isLoopbackHost(h)).toBe(false)
  })
})

describe('bindProblem', () => {
  test('loopback is fine', () => {
    expect(bindProblem(readEnv({ SOII_LOCAL: '1' }), '127.0.0.1')).toBeNull()
  })

  test('a non-loopback host is refused in local mode', () => {
    expect(bindProblem(readEnv({ SOII_LOCAL: '1' }), '0.0.0.0')).toMatch(/localhost only/)
  })

  test('SOII_LOCAL_FORCE=1 allows it', () => {
    expect(bindProblem(readEnv({ SOII_LOCAL: '1', SOII_LOCAL_FORCE: '1' }), '0.0.0.0')).toBeNull()
  })

  test('plain dev mode refuses a non-loopback host too: it has no sign-in either', () => {
    expect(bindProblem(readEnv({}), '0.0.0.0')).toMatch(/localhost only/)
    expect(bindProblem(readEnv({}), 'localhost')).toBeNull()
    expect(bindProblem(readEnv({ SOII_LOCAL_FORCE: '1' }), '0.0.0.0')).toBeNull()
  })
})

describe('hostHeaderAllowed', () => {
  test('loopback names with or without a port', () => {
    for (const h of ['localhost:5011', '127.0.0.1:5011', 'localhost', '[::1]:5011', '127.0.0.1']) expect(hostHeaderAllowed(h)).toBe(true)
  })

  test('anything else, including a missing header, is a possible DNS rebinding attack', () => {
    for (const h of ['evil.com', 'evil.com:5011', 'localhost.evil.com', '192.168.1.5:5011', undefined]) expect(hostHeaderAllowed(h)).toBe(false)
  })
})

describe('the app in local mode', () => {
  const dir = makeGeneratedFixture()
  const local = createSoiiApp({ env: { SOII_LOCAL: '1', VAULT_PATH: '/tmp/none' }, generatedDir: dir })
  const hit = (path: string, host: string | null, init: RequestInit = {}) =>
    local.request(`http://localhost:5011${path}`, { ...init, headers: { ...(host ? { Host: host } : {}), ...(init.headers as Record<string, string> | undefined) } })

  test('no cookie needed', async () => {
    expect((await hit('/api/vault', 'localhost:5011')).status).toBe(200)
  })

  test('a foreign Host header is rejected before any route runs', async () => {
    const res = await hit('/api/vault', 'evil.com:5011')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'bad_host' })
    expect((await hit('/api/health', 'evil.com')).status).toBe(403)
  })

  test('SOII_LOCAL_FORCE=1 turns the Host check off', async () => {
    const forced = createSoiiApp({ env: { SOII_LOCAL: '1', SOII_LOCAL_FORCE: '1', VAULT_PATH: '/tmp/none' }, generatedDir: dir })
    const res = await forced.request('http://mac.local:5011/api/vault', { headers: { Host: 'mac.local:5011' } })
    expect(res.status).toBe(200)
  })

  test('plain dev mode (`bun run dev`) rejects a foreign Host header too: DNS rebinding reaches it as well', async () => {
    const dev = createSoiiApp({ env: { VAULT_PATH: '/tmp/none' }, generatedDir: dir })
    for (const path of ['/api/vault', '/api/health', '/api/capabilities']) {
      const res = await dev.request(`http://soii.test${path}`, { headers: { Host: 'soii.test:13390' } })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'bad_host' })
    }
    const write = await dev.request('http://soii.test:13390/api/notes', {
      method: 'POST',
      headers: { Host: 'soii.test:13390', Origin: 'http://soii.test:13390', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'book', values: { title: 'Rebind' } })
    })
    expect(write.status).toBe(403)
    expect((await dev.request('http://localhost:13390/api/vault', { headers: { Host: 'localhost:13390' } })).status).toBe(200)
    expect((await dev.request('http://127.0.0.1:13390/api/vault', { headers: { Host: '127.0.0.1:13390' } })).status).toBe(200)
  })

  test('a request with no Host header at all is not a browser, so it is not a rebinding attack', async () => {
    const dev = createSoiiApp({ env: {}, generatedDir: dir })
    expect((await dev.request('http://soii.test/api/vault')).status).toBe(200)
    expect((await dev.request('http://soii.test/api/vault', { headers: { Host: '' } })).status).toBe(403)
  })

  test('SOII_LOCAL_FORCE=1 turns the Host check off in dev mode as well', async () => {
    const dev = createSoiiApp({ env: { SOII_LOCAL_FORCE: '1' }, generatedDir: dir })
    expect((await dev.request('http://soii.test/api/vault', { headers: { Host: 'soii.test' } })).status).toBe(200)
  })

  test('POST /api/sync pushes in local mode but not in plain dev mode', async () => {
    const vault = mkdtempSync(join(tmpdir(), 'soii-local-vault-'))
    mkdirSync(join(vault, '.git'))
    const run = async (env: Record<string, string>, host: string) => {
      const calls: string[] = []
      const git = async (_cwd: string, args: string[]) => {
        calls.push(args[0])
        return { code: 0, out: args[0] === 'rev-list' ? '1' : 'Already up to date.' }
      }
      const a = createSoiiApp({ env: { ...env, VAULT_PATH: vault }, generatedDir: dir, git })
      const res = await a.request(`http://${host}/api/sync`, { method: 'POST', headers: { Host: host, Origin: `http://${host}` } })
      return { status: res.status, calls }
    }
    expect(await run({ SOII_LOCAL: '1' }, 'localhost:5011')).toEqual({ status: 200, calls: ['rev-parse', 'pull', 'rev-list', 'push', 'ls-remote'] }) // the last one: Sync also looks for a newer soii release
    expect(await run({}, 'localhost:13390')).toEqual({ status: 200, calls: ['rev-parse', 'pull'] })
  })
})
