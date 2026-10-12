// app/server/view-routes.test.ts
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSoiiApp } from './app'
import { makeGeneratedFixture } from './test-fixture'

const CONFIG = 'workspaces:\n  - id: projects\n    title: Projects\n    tabs:\n      - { id: board, title: Board, view: board, query: { type: project } }\n'
const req = (method: string, path: string, body?: unknown, origin: string | null = 'http://localhost') =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
function vault() {
  const root = mkdtempSync(join(tmpdir(), 'soii-viewroute-'))
  writeFileSync(join(root, 'soii.config.yml'), CONFIG)
  return root
}
const devApp = (root: string) => createSoiiApp({ env: { SOII_DEV_AUTH: '1', VAULT_PATH: root }, generatedDir: makeGeneratedFixture() })
const ADD = { workspace: 'projects', tab: { title: 'Active', view: 'list', query: { type: 'project' } } }

describe('/api/views', () => {
  test('needs a session', async () => {
    const app = createSoiiApp({ env: { SOII_SESSION_SECRET: 'x'.repeat(40), GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: 'b', SOII_ALLOWED_GITHUB_LOGINS: 'me' } })
    expect((await app.fetch(req('POST', '/api/views', ADD))).status).toBe(401)
  })
  test('rejects a missing or foreign Origin and writes nothing', async () => {
    const root = vault()
    for (const origin of [null, 'https://evil.example']) {
      expect((await devApp(root).fetch(req('POST', '/api/views', ADD, origin))).status).toBe(403)
      expect((await devApp(root).fetch(req('DELETE', '/api/views/projects/board', undefined, origin))).status).toBe(403)
    }
    expect(readFileSync(join(root, 'soii.config.yml'), 'utf8')).toBe(CONFIG)
  })
  test('POST adds (201), PATCH changes sort (200), DELETE removes (200)', async () => {
    const root = vault()
    const app = devApp(root)
    const added = await app.fetch(req('POST', '/api/views', ADD))
    expect(added.status).toBe(201)
    expect(await added.json()).toMatchObject({ workspace: 'projects', tabId: 'active', title: 'Active', via: 'local' })
    const patched = await app.fetch(req('PATCH', '/api/views/projects/active', { sort: [{ field: 'title', dir: 'asc' }] }))
    expect(patched.status).toBe(200)
    expect(readFileSync(join(root, 'soii.config.yml'), 'utf8')).toContain('field: title')
    expect((await app.fetch(req('DELETE', '/api/views/projects/active'))).status).toBe(200)
    expect(readFileSync(join(root, 'soii.config.yml'), 'utf8')).not.toContain('id: active')
  })
  test('400 for a bad body, 409 for the last tab', async () => {
    const root = vault()
    const app = devApp(root)
    expect((await app.fetch(req('POST', '/api/views', { workspace: 'projects', tab: { view: 'list' } }))).status).toBe(400)
    expect((await app.fetch(req('PATCH', '/api/views/projects/board', { view: 'list' }))).status).toBe(400)
    const last = await app.fetch(req('DELETE', '/api/views/projects/board'))
    expect(last.status).toBe(409)
    expect(await last.json()).toMatchObject({ error: 'last_tab' })
  })
  test('501 when writing is not set up', async () => {
    const app = createSoiiApp({ env: { SOII_DEV_AUTH: '1' }, generatedDir: makeGeneratedFixture() })
    expect((await app.fetch(req('POST', '/api/views', ADD))).status).toBe(501)
  })
})
