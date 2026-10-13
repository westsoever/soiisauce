// app/server/tex-route.test.ts
// GET /api/tex/<id> over a stub store and a fake compiler (spec §4.1).
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodePath } from '../lib/paths'
import type { NoteDoc } from '../lib/types'
import { createSoiiApp } from './app'
import type { TexCompiler, TexResult } from './tex'
import type { VersionChecker } from './version'
import type { VaultStore } from './vault-store'

const dir = mkdtempSync(join(tmpdir(), 'soii-tex-route-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const pdfFile = join(dir, 'out.pdf')
writeFileSync(pdfFile, '%PDF-1.5 test')

const doc = (id: string, extra: Partial<NoteDoc> = {}): NoteDoc =>
  ({ id, title: id, path: id, folder: '', type: null, tags: [], date: null, updated: null, frontmatter: {}, excerpt: '', image: null, wordCount: 0, html: '', headings: [], outgoing: [], backlinks: [], ...extra }) as NoteDoc
const SPACED = 'Papers/My Paper (v2).tex'
const ACCENTED = 'Papers/Café.tex'
const DOCS = new Map<string, NoteDoc>([
  [SPACED, doc(SPACED, { format: 'tex', source: 'x' })],
  [ACCENTED, doc(ACCENTED, { format: 'tex', source: 'x' })],
  ['People/Anna', doc('People/Anna', { path: 'People/Anna.md' })]
])
const store: VaultStore = {
  meta: () => null,
  index: () => ({ notes: [...DOCS.values()] }) as never,
  note: id => DOCS.get(id) ?? null,
  search: () => [],
  filePath: () => null
}
const version: VersionChecker = {
  info: () => ({ installed: null, latest: null, updateAvailable: false, releaseUrl: null }) as never,
  ensureStarted: () => {},
  refresh: async () => {},
  stop: () => {}
}

const LOCAL = { SOII_LOCAL: '1', SOII_LOCAL_FORCE: '1', VAULT_PATH: dir }
function appWith(result: TexResult | null, env: Record<string, string> = LOCAL) {
  const seen: string[] = []
  const tex: TexCompiler | null = result
    ? {
        compile: async path => {
          seen.push(path)
          return result
        }
      }
    : null
  const app = createSoiiApp({ env, store, tex, version })
  return { get: (id: string) => app.request(`http://localhost/api/tex/${encodePath(id)}`), seen }
}

describe('GET /api/tex/*', () => {
  test('serves the compiled PDF for an encoded id with spaces and brackets', async () => {
    const { get, seen } = appWith({ ok: true, pdf: pdfFile, tool: 'pdflatex' })
    const res = await get(SPACED)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toBe('%PDF-1.5 test')
    expect(seen).toEqual([SPACED])
  })

  test('a non-ASCII file name round-trips through the URL', async () => {
    const { get, seen } = appWith({ ok: true, pdf: pdfFile, tool: 'pdflatex' })
    expect(encodePath(ACCENTED)).toContain('%')
    expect((await get(ACCENTED)).status).toBe(200)
    expect(seen).toEqual([ACCENTED])
  })

  test('404 for an unknown id or a Markdown note; nothing compiles', async () => {
    const { get, seen } = appWith({ ok: true, pdf: pdfFile, tool: 'pdflatex' })
    expect((await get('Papers/nope.tex')).status).toBe(404)
    expect((await get('People/Anna')).status).toBe(404)
    expect(seen).toEqual([])
  })

  test('maps each failure to its status and body', async () => {
    const failed = await appWith({ ok: false, error: 'tex_failed', tool: 'pdflatex', log: ['! Undefined control sequence.'] }).get(SPACED)
    expect(failed.status).toBe(422)
    expect(await failed.json()).toEqual({ error: 'tex_failed', tool: 'pdflatex', log: ['! Undefined control sequence.'] })
    expect((await appWith({ ok: false, error: 'tex_no_compiler', message: 'm' }).get(SPACED)).status).toBe(503)
    expect((await appWith({ ok: false, error: 'tex_timeout', message: 'm' }).get(SPACED)).status).toBe(504)
  })

  test('a .tex deleted since the last build is a 404 "not_found", not a 500', async () => {
    const res = await appWith({ ok: false, error: 'tex_missing', message: "This file isn't in the vault anymore." }).get(SPACED)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  test('501 without a vault on disk (hosted mode)', async () => {
    const res = await appWith(null, { SOII_DEV_AUTH: '1' }).get(SPACED)
    expect(res.status).toBe(501)
    expect(await res.json()).toEqual({ error: 'tex_unavailable', message: 'LaTeX files compile in local mode only.' })
  })
})
