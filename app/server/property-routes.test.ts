// app/server/property-routes.test.ts
import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSoiiApp } from './app'
import { makeGeneratedFixture } from './test-fixture'

const post = (body: unknown, origin: string | null = 'http://localhost') =>
  new Request('http://localhost/api/notes/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body)
  })
const change = { path: 'People/Anna.md', key: 'relationship', value: 'close friend', date: '2026-10-12' }

function vault() {
  const root = mkdtempSync(join(tmpdir(), 'soii-proproute-'))
  mkdirSync(join(root, 'People'))
  writeFileSync(join(root, 'People/Anna.md'), '---\nrelationship: friend\n---\n# Anna\n')
  return root
}

describe('POST /api/notes/properties', () => {
  test('rejects a missing or foreign Origin and writes nothing', async () => {
    const root = vault()
    const app = createSoiiApp({ env: { VAULT_PATH: root }, generatedDir: makeGeneratedFixture() })
    for (const origin of [null, 'https://evil.example']) expect((await app.fetch(post(change, origin))).status).toBe(403)
    expect(readFileSync(join(root, 'People/Anna.md'), 'utf8')).toContain('relationship: friend\n')
  })

  test('sets the property on a note from the compiled index', async () => {
    const root = vault()
    const app = createSoiiApp({ env: { VAULT_PATH: root }, generatedDir: makeGeneratedFixture() })
    const res = await app.fetch(post(change))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ path: 'People/Anna.md' })
    expect(readFileSync(join(root, 'People/Anna.md'), 'utf8')).toBe('---\nrelationship: close friend\n---\n# Anna\n')
  })

  test('400 for a protected key, 404 for a note outside the index, 503 before the vault is built', async () => {
    const root = vault()
    const app = createSoiiApp({ env: { VAULT_PATH: root }, generatedDir: makeGeneratedFixture() })
    expect((await app.fetch(post({ ...change, key: 'tags' }))).status).toBe(400)
    expect((await app.fetch(post({ ...change, path: 'People/Nobody.md' }))).status).toBe(404)
    const unbuilt = createSoiiApp({ env: { VAULT_PATH: root }, generatedDir: '/nonexistent/soii' })
    expect((await unbuilt.fetch(post(change))).status).toBe(503)
  })

  test('GET /api/notes/<id> still reads notes', async () => {
    const app = createSoiiApp({ env: {}, generatedDir: makeGeneratedFixture() })
    expect((await app.fetch(new Request('http://localhost/api/notes/People/Anna'))).status).toBe(200)
  })
})
