// app/server/write-routes.test.ts
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSoiiApp } from './app'

const post = (path: string, body: unknown, origin: string | null = 'http://localhost') =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body)
  })

describe('write routes', () => {
  test('reject a missing or foreign Origin', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-routes-'))
    const app = createSoiiApp({ env: { VAULT_PATH: root } })
    for (const origin of [null, 'https://evil.example']) {
      expect((await app.fetch(post('/api/notes', { type: 'book', values: { title: 'Dune' } }, origin))).status).toBe(403)
      expect((await app.fetch(post('/api/sync', {}, origin))).status).toBe(403)
    }
    expect(existsSync(join(root, '04-Resources'))).toBe(false)
  })

  test('write a note for a same-origin request and report capabilities', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-routes-'))
    const app = createSoiiApp({ env: { VAULT_PATH: root } })
    expect(await (await app.fetch(new Request('http://localhost/api/capabilities'))).json()).toEqual({ write: true, sync: true, remote: null })
    const res = await app.fetch(post('/api/notes', { type: 'book', values: { title: 'Dune' } }))
    expect(res.status).toBe(201)
    // A temp folder is not a git repo, so the file is saved and the response says nothing was committed.
    expect(await res.json()).toEqual({ path: '04-Resources/Library/Books/Dune.md', warning: expect.stringContaining('not a git repository') })
    expect((await app.fetch(post('/api/notes', { type: 'book', values: { title: 'Dune' } }))).status).toBe(409)
  })

  test('capabilities name the remote Sync talks to, without credentials', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-routes-'))
    mkdirSync(join(root, '.git'))
    const answers: Record<string, string> = {
      'rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/main',
      remote: 'origin',
      'remote get-url origin': 'https://me:ghp_secret@github.com/me/notes.git'
    }
    const app = createSoiiApp({ env: { VAULT_PATH: root }, git: async (_cwd, args) => ({ code: args.join(' ') in answers ? 0 : 1, out: answers[args.join(' ')] ?? '' }) })
    const body = await (await app.fetch(new Request('http://localhost/api/capabilities'))).json()
    expect(body).toEqual({ write: true, sync: true, remote: 'https://github.com/me/notes.git' })
    expect(JSON.stringify(body)).not.toContain('ghp_secret')
  })

  test('POST /api/sync on a vault with no remote is a plain 409, not a git dump', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-routes-'))
    mkdirSync(join(root, '.git'))
    const git = async (_cwd: string, args: string[]) => ({ code: args[0] === 'remote' || args[0] === 'branch' ? 0 : 128, out: args[0] === 'branch' ? 'main' : args[0] === 'remote' ? '' : 'fatal: no upstream configured' })
    const app = createSoiiApp({ env: { VAULT_PATH: root }, git })
    const res = await app.fetch(post('/api/sync', {}))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('not_connected')
    expect(body.message).toContain("isn't connected to GitHub yet")
    expect(body.message).not.toContain('fatal')
  })

  test('capabilities are off when nothing is configured', async () => {
    const app = createSoiiApp({ env: {} })
    expect(await (await app.fetch(new Request('http://localhost/api/capabilities'))).json()).toEqual({ write: false, sync: false, remote: null })
  })
})
