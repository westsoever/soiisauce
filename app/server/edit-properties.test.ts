// app/server/edit-properties.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NoteMeta } from '../lib/types'
import { editProperty, parsePropertyRequest } from './edit-properties'
import { readEnv } from './env'
import type { FetchLike } from './github-oauth'
import type { RunGit } from './sync'

const D = '2026-10-12'
const GH = { VAULT_REPO: 'me/vault', VAULT_WRITE_TOKEN: 'ghp_WRITE', VAULT_REF: 'main' }
const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-props-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))

const PATH = '05-Knowledge/People/Marvin.md'
const MARVIN = { id: PATH.replace(/\.md$/, ''), title: 'Marvin', path: PATH, type: 'person', frontmatter: { type: 'person' } } as unknown as NoteMeta
const NOTES = [MARVIN, { ...MARVIN, id: 'Pics/x', path: 'Pics/x.png', title: 'x' }]
const SOURCE = '---\ntype: person\nrelationship: friend\nupdated: 2026-01-01\n---\n# Marvin\n'

const noFetch: FetchLike = async () => {
  throw new Error('fetch should not be called')
}
const noGit: RunGit = async () => {
  throw new Error('git should not be called')
}

// An in-memory GitHub repo. `stale` simulates someone else committing between our GET and PUT.
function fakeGithub(files: Record<string, string>, stale = 0) {
  let n = 1
  const shas = new Map(Object.keys(files).map(p => [p, `sha${n++}`]))
  const calls: { method: string; path: string; body?: { sha?: string; content: string; message: string } }[] = []
  const fetch: FetchLike = async (url, init = {}) => {
    const path = decodeURIComponent(new URL(url).pathname.replace('/repos/me/vault/contents/', ''))
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body })
    if (method === 'GET') {
      if (!(path in files)) return new Response('{}', { status: 404 })
      return Response.json({ sha: shas.get(path), encoding: 'base64', content: Buffer.from(files[path]).toString('base64') })
    }
    if (body.sha !== shas.get(path)) return new Response('{}', { status: 409 })
    if (stale > 0) {
      stale--
      files[path] = files[path].replace('# Marvin', '# Marvin\n\nEdited on the laptop.')
      shas.set(path, `sha${n++}`)
      return new Response('{}', { status: 409 })
    }
    files[path] = Buffer.from(body.content, 'base64').toString('utf8')
    shas.set(path, `sha${n++}`)
    return Response.json({ commit: { html_url: `https://github.com/me/vault/commit/${n}` } }, { status: 201 })
  }
  return { fetch, files, calls }
}

const body = (extra: Record<string, unknown> = {}) => ({ path: PATH, key: 'relationship', value: 'close friend', date: D, ...extra })

describe('parsePropertyRequest', () => {
  test('rejects bad shapes, keys, values and dates', () => {
    const bad = [
      null,
      'x',
      [],
      body({ path: 7 }),
      body({ path: '' }),
      body({ key: 'title' }),
      body({ key: 'tags' }),
      body({ key: '__proto__' }),
      body({ key: 'a:b' }),
      body({ value: { a: 1 } }),
      body({ value: undefined }),
      body({ value: 'x'.repeat(501) }),
      body({ date: '2026-02-30' })
    ]
    for (const b of bad) expect(parsePropertyRequest(b)).toMatchObject({ ok: false, status: 400 })
  })

  test('cleans the value; the date is optional', () => {
    expect(parsePropertyRequest(body({ value: '  close   friend ' }))).toEqual({ ok: true, req: { path: PATH, key: 'relationship', value: 'close friend', date: D } })
    expect(parsePropertyRequest(body({ date: undefined, value: ['a', ' '] }))).toEqual({ ok: true, req: { path: PATH, key: 'relationship', value: ['a'], date: null } })
  })
})

describe('editProperty', () => {
  test('says so when writing is not configured', async () => {
    expect(await editProperty(readEnv({}), body(), { fetch: noFetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 501 })
  })

  test('only edits markdown notes in the compiled index', async () => {
    const env = readEnv(GH)
    expect(await editProperty(env, body({ path: 'Elsewhere/Nope.md' }), { fetch: noFetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404 })
    expect(await editProperty(env, body({ path: 'Pics/x.png' }), { fetch: noFetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404 })
  })

  test('GitHub: one commit that changes only the property (and updated)', async () => {
    const gh = fakeGithub({ [PATH]: SOURCE })
    const r = await editProperty(readEnv(GH), body(), { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, path: PATH, via: 'github', pulled: null, warning: null })
    expect(gh.files[PATH]).toBe('---\ntype: person\nrelationship: close friend\nupdated: 2026-10-12\n---\n# Marvin\n')
    expect(gh.calls.map(c => c.method)).toEqual(['GET', 'PUT'])
    expect(gh.calls[1].body?.message).toBe('soii: edit "Marvin" (relationship)')
  })

  test('GitHub: re-reads and retries once when the note changed meanwhile, keeping the other edit', async () => {
    const gh = fakeGithub({ [PATH]: SOURCE }, 1)
    const r = await editProperty(readEnv(GH), body(), { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true })
    expect(gh.files[PATH]).toContain('relationship: close friend')
    expect(gh.files[PATH]).toContain('Edited on the laptop.')
  })

  test('GitHub: unreadable frontmatter is refused and nothing is written', async () => {
    const gh = fakeGithub({ [PATH]: '---\nrelationship: [oops\n---\n# Marvin\n' })
    expect(await editProperty(readEnv(GH), body(), { fetch: gh.fetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 422, error: 'unreadable' })
    expect(gh.calls.map(c => c.method)).toEqual(['GET'])
  })

  test('GitHub: a note that has gone is a 404', async () => {
    const gh = fakeGithub({})
    expect(await editProperty(readEnv(GH), body(), { fetch: gh.fetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404, error: 'gone' })
  })

  test('local: writes the file in VAULT_PATH and commits just that file', async () => {
    const root = tmp()
    mkdirSync(join(root, '.git'))
    mkdirSync(join(root, '05-Knowledge/People'), { recursive: true })
    writeFileSync(join(root, PATH), SOURCE)
    const git: { args: string[] }[] = []
    const runGit: RunGit = async (_cwd, args) => {
      git.push({ args })
      return { code: 0, out: '' }
    }
    const r = await editProperty(readEnv({ VAULT_PATH: root }), body({ key: 'birthday', value: '1990-05-01' }), { fetch: noFetch, git: runGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, via: 'local', commitUrl: null })
    expect(readFileSync(join(root, PATH), 'utf8')).toBe('---\ntype: person\nrelationship: friend\nupdated: 2026-10-12\nbirthday: 1990-05-01\n---\n# Marvin\n')
    expect(git.map(g => g.args)).toEqual([
      ['add', '--', PATH],
      ['commit', '-m', 'soii: edit "Marvin" (birthday)', '--only', '--', PATH]
    ])
  })

  test('local: unreadable frontmatter leaves the file untouched', async () => {
    const root = tmp()
    mkdirSync(join(root, '05-Knowledge/People'), { recursive: true })
    const broken = '---\na: 1\na: 2\n---\n# Marvin\n'
    writeFileSync(join(root, PATH), broken)
    expect(await editProperty(readEnv({ VAULT_PATH: root }), body(), { fetch: noFetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 422 })
    expect(readFileSync(join(root, PATH), 'utf8')).toBe(broken)
  })
})
