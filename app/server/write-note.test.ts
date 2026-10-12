// app/server/write-note.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from './env'
import type { FetchLike } from './github-oauth'
import { writeNote, writeTarget } from './write-note'

const GH = { VAULT_REPO: 'me/vault', VAULT_WRITE_TOKEN: 'ghp_WRITE', VAULT_REF: 'main' }
const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-write-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))

const noFetch: FetchLike = async () => {
  throw new Error('fetch should not be called')
}

describe('writeTarget', () => {
  test('github wins, then local disk, never local on Vercel', () => {
    expect(writeTarget(readEnv({ ...GH, VAULT_PATH: '/v' }))).toBe('github')
    expect(writeTarget(readEnv({ VAULT_PATH: '/v' }))).toBe('local')
    expect(writeTarget(readEnv({ VAULT_PATH: '/v', VERCEL: '1' }))).toBeNull()
    expect(writeTarget(readEnv({ VAULT_REPO: 'me/vault' }))).toBeNull()
  })
})

describe('writeNote validation', () => {
  const env = readEnv(GH)
  test('rejects unknown types, odd bodies and a missing title', async () => {
    for (const body of [null, 'x', {}, { type: 'nope', values: {} }, { type: 'book', values: [] }, { type: 'book', values: { title: 5 } }, { type: '__proto__', values: {} }]) {
      const r = await writeNote(env, body, noFetch)
      expect(r).toMatchObject({ ok: false, status: 400 })
    }
    expect(await writeNote(env, { type: 'book', values: { title: '   ' } }, noFetch)).toMatchObject({ ok: false, error: 'title_required' })
  })

  test('rejects oversized values', async () => {
    expect(await writeNote(env, { type: 'book', values: { title: 'x'.repeat(501) } }, noFetch)).toMatchObject({ ok: false, status: 400 })
  })

  test('says so when writing is not configured', async () => {
    expect(await writeNote(readEnv({}), { type: 'book', values: { title: 'Dune' } }, noFetch)).toMatchObject({ ok: false, status: 501 })
  })
})

describe('writeNote to GitHub', () => {
  test('commits to the configured branch without a sha, to a path the server chose', async () => {
    let call: { url: string; init: RequestInit } | null = null
    const fetchImpl: FetchLike = async (url, init) => {
      call = { url, init: init as RequestInit }
      return new Response(JSON.stringify({ commit: { html_url: 'https://github.com/me/vault/commit/abc' } }), { status: 201 })
    }
    const r = await writeNote(readEnv(GH), { type: 'book', values: { title: 'Wait... what', author: 'Frank Herbert' }, path: 'evil/x.md' }, fetchImpl)
    expect(r).toEqual({ ok: true, path: '04-Resources/Library/Books/Wait... what.md', via: 'github', commitUrl: 'https://github.com/me/vault/commit/abc' })
    expect(call!.url).toBe('https://api.github.com/repos/me/vault/contents/04-Resources/Library/Books/Wait...%20what.md')
    const sent = JSON.parse(call!.init.body as string)
    expect(sent.branch).toBe('main')
    expect(sent.sha).toBeUndefined()
    expect(sent.message).toBe('soii: add book "Wait... what"')
    expect(Buffer.from(sent.content, 'base64').toString()).toContain('type: book')
    expect((call!.init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_WRITE')
  })

  test('an existing file (422) becomes a 409', async () => {
    const r = await writeNote(readEnv(GH), { type: 'movie', values: { title: 'Heat' } }, async () => new Response('{}', { status: 422 }))
    expect(r).toMatchObject({ ok: false, status: 409, error: 'exists' })
  })

  test('a rejected token gives a clear message and never echoes the token', async () => {
    const r = await writeNote(readEnv(GH), { type: 'movie', values: { title: 'Heat' } }, async () => new Response('{}', { status: 403 }))
    expect(r).toMatchObject({ ok: false, status: 502, error: 'github_rejected' })
    expect(JSON.stringify(r)).not.toContain('ghp_WRITE')
  })

  test('a network failure is a 502', async () => {
    const r = await writeNote(readEnv(GH), { type: 'movie', values: { title: 'Heat' } }, async () => {
      throw new Error('boom ghp_WRITE')
    })
    expect(r).toMatchObject({ ok: false, status: 502, error: 'github_unreachable' })
    expect(JSON.stringify(r)).not.toContain('ghp_WRITE')
  })
})

describe('writeNote to local disk', () => {
  test('creates the folder, writes the frontmatter, and refuses to overwrite', async () => {
    const root = tmp()
    const env = readEnv({ VAULT_PATH: root })
    const body = { type: 'book', values: { title: 'Dune', author: 'Frank Herbert', status: 'want' } }
    const first = await writeNote(env, body, noFetch)
    expect(first).toEqual({ ok: true, path: '04-Resources/Library/Books/Dune.md', via: 'local', commitUrl: null })
    const text = readFileSync(join(root, '04-Resources/Library/Books/Dune.md'), 'utf8')
    expect(text).toMatch(/^---\ntype: book\ntitle: Dune\nauthor: Frank Herbert\nisbn:\ncover:\nstatus: want\n/)
    expect(text).toMatch(/\ncreated: \d{4}-\d{2}-\d{2}\n/)
    expect(text.endsWith('---\n\n# Dune\n')).toBe(true)
    expect(await writeNote(env, body, noFetch)).toMatchObject({ ok: false, status: 409, error: 'exists' })
  })

  test('a newline in a value cannot add frontmatter keys', async () => {
    const root = tmp()
    await writeNote(readEnv({ VAULT_PATH: root }), { type: 'book', values: { title: 'Dune', author: 'x\nsoii: hidden' } }, noFetch)
    const text = readFileSync(join(root, '04-Resources/Library/Books/Dune.md'), 'utf8')
    expect(text.split('\n').filter(l => l.startsWith('soii:'))).toEqual([])
  })

  test('nothing is written outside the vault for a hostile title', async () => {
    const root = tmp()
    await writeNote(readEnv({ VAULT_PATH: root }), { type: 'book', values: { title: '../../escape' } }, noFetch)
    expect(existsSync(join(root, '..', 'escape.md'))).toBe(false)
    expect(existsSync(join(root, '04-Resources/Library/Books/.. escape.md'))).toBe(true)
  })
})

describe('writeNote collection and category', () => {
  test('writes them as YAML lists, de-duplicated', async () => {
    const dir = tmp()
    const r = await writeNote(readEnv({ VAULT_PATH: dir }), { type: 'movie', values: { title: 'Heat', collection: 'Criterion, criterion', category: ' Crime ,Thriller' } }, noFetch)
    expect(r).toMatchObject({ ok: true, via: 'local' })
    expect(readFileSync(join(dir, '04-Resources/Library/Movies/Heat.md'), 'utf8')).toBe(
      '---\ntype: movie\ntitle: Heat\ncollection:\n  - Criterion\ncategory:\n  - Crime\n  - Thriller\n---\n\n# Heat\n'
    )
  })
  test('rejects more than 5 values or a value over 60 characters, and writes nothing', async () => {
    const dir = tmp()
    const env = readEnv({ VAULT_PATH: dir })
    expect(await writeNote(env, { type: 'book', values: { title: 'X', category: 'a,b,c,d,e,f' } }, noFetch)).toMatchObject({ ok: false, status: 400, error: 'bad_value', message: 'Category takes at most 5 values.' })
    expect(await writeNote(env, { type: 'book', values: { title: 'X', collection: 'x'.repeat(61) } }, noFetch)).toMatchObject({ ok: false, status: 400, error: 'bad_value' })
    expect(existsSync(join(dir, '04-Resources/Library/Books/X.md'))).toBe(false)
  })
})
