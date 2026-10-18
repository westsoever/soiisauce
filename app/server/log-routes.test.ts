// app/server/log-routes.test.ts
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSoiiApp } from './app'
import { makeGeneratedFixture } from './test-fixture'

const post = (body: unknown, origin: string | null = 'http://localhost') =>
  new Request('http://localhost/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body)
  })
const D = '2026-10-12'
const book = { mode: 'new', kind: 'book', title: 'Dune', values: { status: 'reading' }, text: '', date: D, how: null }

describe('POST /api/log', () => {
  test('rejects a missing or foreign Origin and writes nothing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-logroute-'))
    const app = createSoiiApp({ env: { VAULT_PATH: root }, generatedDir: makeGeneratedFixture() })
    for (const origin of [null, 'https://evil.example']) expect((await app.fetch(post(book, origin))).status).toBe(403)
    expect(existsSync(join(root, '04-Resources'))).toBe(false)
  })

  test('creates a note, then a second one beside it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-logroute-'))
    const app = createSoiiApp({ env: { VAULT_PATH: root }, generatedDir: makeGeneratedFixture() })
    const res = await app.fetch(post(book))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ path: '04-Resources/Library/Books/Dune.md', mode: 'new' })
    const again = await app.fetch(post(book))
    expect(again.status).toBe(201)
    expect(await again.json()).toMatchObject({ path: '04-Resources/Library/Books/Dune 2.md', mode: 'new' })
  })

  test('appends to a note from the compiled index', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-logroute-'))
    mkdirSync(join(root, 'People'))
    writeFileSync(join(root, 'People/Anna.md'), '# Anna\n')
    const app = createSoiiApp({ env: { VAULT_PATH: root }, generatedDir: makeGeneratedFixture() })
    const res = await app.fetch(post({ mode: 'append', kind: 'conversation', path: 'People/Anna.md', values: {}, text: 'Lunch.', date: D, how: 'met' }))
    expect(res.status).toBe(201)
    expect(readFileSync(join(root, 'People/Anna.md'), 'utf8')).toContain('- 2026-10-12 (met) — Lunch.')
  })

  test('400 for a bad body, 503 for an append before the vault is built', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-logroute-'))
    const app = createSoiiApp({ env: { VAULT_PATH: root }, generatedDir: '/nonexistent/soii' })
    expect((await app.fetch(post({ mode: 'new', kind: 'nope', date: D }))).status).toBe(400)
    expect((await app.fetch(post({ mode: 'append', kind: 'conversation', path: 'People/Anna.md', text: 'x', date: D }))).status).toBe(503)
  })
})
