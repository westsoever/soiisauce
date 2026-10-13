// app/server/write-routes.test.ts
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, existsSync } from 'node:fs'
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
    expect(await (await app.fetch(new Request('http://localhost/api/capabilities'))).json()).toEqual({ write: true, sync: true })
    const res = await app.fetch(post('/api/notes', { type: 'book', values: { title: 'Dune' } }))
    expect(res.status).toBe(201)
    // A temp folder is not a git repo, so the file is saved and the response says nothing was committed.
    expect(await res.json()).toEqual({ path: '04-Resources/Library/Books/Dune.md', warning: expect.stringContaining('not a git repository') })
    expect((await app.fetch(post('/api/notes', { type: 'book', values: { title: 'Dune' } }))).status).toBe(409)
  })

  test('capabilities are off when nothing is configured', async () => {
    const app = createSoiiApp({ env: {} })
    expect(await (await app.fetch(new Request('http://localhost/api/capabilities'))).json()).toEqual({ write: false, sync: false })
  })
})
