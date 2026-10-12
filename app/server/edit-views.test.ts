// app/server/edit-views.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { editViews, parseAddRequest, parseUpdateRequest } from './edit-views'
import { readEnv } from './env'
import type { FetchLike } from './github-oauth'
import type { RunGit } from './sync'

const GH = { VAULT_REPO: 'me/vault', VAULT_WRITE_TOKEN: 'ghp_WRITE', VAULT_REF: 'main' }
const CONFIG = 'title: Sam\nworkspaces:\n  - id: projects\n    title: Projects\n    tabs:\n      - { id: board, title: Board, view: board, query: { type: project } }\n'
const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-views-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
const noFetch: FetchLike = async () => {
  throw new Error('fetch should not be called')
}
const gitLog: { args: string[] }[] = []
const okGit: RunGit = async (_cwd, args) => {
  gitLog.push({ args })
  return { code: 0, out: '' }
}

// In-memory GitHub, same shape as edit-properties.test.ts. `stale` makes the next N PUTs conflict.
function fakeGithub(files: Record<string, string>, stale = 0) {
  let n = 1
  const shas = new Map(Object.keys(files).map(p => [p, `sha${n++}`]))
  const fetch: FetchLike = async (url, init = {}) => {
    const path = decodeURIComponent(new URL(url).pathname.replace('/repos/me/vault/contents/', ''))
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    if (method === 'GET') {
      if (!(path in files)) return new Response('{}', { status: 404 })
      return Response.json({ sha: shas.get(path), encoding: 'base64', content: Buffer.from(files[path]).toString('base64') })
    }
    if (path in files && body.sha !== shas.get(path)) return new Response('{}', { status: 409 })
    if (stale > 0) {
      stale--
      files[path] = files[path].replace('title: Sam', 'title: Sam (laptop)')
      shas.set(path, `sha${n++}`)
      return new Response('{}', { status: 409 })
    }
    files[path] = Buffer.from(body.content, 'base64').toString('utf8')
    shas.set(path, `sha${n++}`)
    return Response.json({ commit: { html_url: `https://github.com/me/vault/commit/${n}` } }, { status: 201 })
  }
  return { fetch, files }
}

describe('parse', () => {
  test('add needs a workspace and a valid tab (id optional)', () => {
    expect(parseAddRequest({ workspace: 'projects', tab: { title: 'A', view: 'list', query: {} } }).ok).toBe(true)
    expect(parseAddRequest({ tab: { title: 'A', view: 'list', query: {} } })).toMatchObject({ ok: false, status: 400 })
    expect(parseAddRequest({ workspace: 'projects', tab: { title: 'A', view: 'list', query: {}, extra: 1 } })).toMatchObject({ ok: false })
    expect(parseAddRequest({ workspace: 'projects', tab: { title: 'A', view: 'list', query: { where: { x: 'y'.repeat(30_000) } } } })).toMatchObject({ ok: false, error: 'too_large' })
  })
  test('update takes query and/or sort, nothing else', () => {
    expect(parseUpdateRequest('projects', 'board', { sort: [{ field: 'title', dir: 'asc' }] }).ok).toBe(true)
    expect(parseUpdateRequest('projects', 'board', { query: { type: 'x' } }).ok).toBe(true)
    expect(parseUpdateRequest('projects', 'board', {})).toMatchObject({ ok: false })
    expect(parseUpdateRequest('projects', 'board', { view: 'list' })).toMatchObject({ ok: false })
  })
})

describe('editViews, local', () => {
  test('adds, commits just soii.config.yml, and reports the tab', async () => {
    const root = tmp()
    writeFileSync(join(root, 'soii.config.yml'), CONFIG)
    gitLog.length = 0
    const env = readEnv({ SOII_LOCAL: '1', VAULT_PATH: root })
    const r = await editViews(env, { action: 'add', workspace: 'projects', tab: { title: 'Active', view: 'list', query: { type: 'project' } } }, { fetch: noFetch, git: okGit })
    expect(r).toMatchObject({ ok: true, workspace: 'projects', tabId: 'active', title: 'Active', via: 'local', commitUrl: null })
    expect(readFileSync(join(root, 'soii.config.yml'), 'utf8')).toContain('id: active')
    // commitLocal only commits when the folder is a git repo; here it isn't, so it warns instead.
    expect((r as { warning: string }).warning).toContain('not a git repository')
  })
  test('creates soii.config.yml when there is none, and edits soii.config.yaml when that is what exists', async () => {
    const a = tmp()
    await editViews(readEnv({ SOII_LOCAL: '1', VAULT_PATH: a }), { action: 'add', workspace: 'goals', tab: { title: 'Big', view: 'list', query: { type: 'goal' } } }, { fetch: noFetch, git: okGit })
    expect(existsSync(join(a, 'soii.config.yml'))).toBe(true)
    const b = tmp()
    writeFileSync(join(b, 'soii.config.yaml'), CONFIG)
    await editViews(readEnv({ SOII_LOCAL: '1', VAULT_PATH: b }), { action: 'remove', workspace: 'people', tabId: 'network' }, { fetch: noFetch, git: okGit })
    expect(existsSync(join(b, 'soii.config.yml'))).toBe(false)
    expect(readFileSync(join(b, 'soii.config.yaml'), 'utf8')).toContain('id: people')
  })
  test('a broken config is refused and left alone', async () => {
    const root = tmp()
    writeFileSync(join(root, 'soii.config.yml'), 'title: [unclosed\n')
    const r = await editViews(readEnv({ SOII_LOCAL: '1', VAULT_PATH: root }), { action: 'remove', workspace: 'projects', tabId: 'board' }, { fetch: noFetch, git: okGit })
    expect(r).toMatchObject({ ok: false, status: 400, error: 'bad_config' })
    expect(readFileSync(join(root, 'soii.config.yml'), 'utf8')).toBe('title: [unclosed\n')
  })
  test('update applies query and sort in one write', async () => {
    const root = tmp()
    writeFileSync(join(root, 'soii.config.yml'), CONFIG)
    const r = await editViews(
      readEnv({ SOII_LOCAL: '1', VAULT_PATH: root }),
      { action: 'update', workspace: 'projects', tabId: 'board', query: { type: 'project', where: { area: 'work' } }, sort: [{ field: 'title', dir: 'asc' }] },
      { fetch: noFetch, git: okGit }
    )
    expect(r.ok).toBe(true)
    const text = readFileSync(join(root, 'soii.config.yml'), 'utf8')
    expect(text).toContain('area: work')
    expect(text).toContain('field: title')
  })
  test('501 with no write target', async () => {
    const r = await editViews(readEnv({}), { action: 'remove', workspace: 'projects', tabId: 'board' }, { fetch: noFetch, git: okGit })
    expect(r).toMatchObject({ ok: false, status: 501 })
  })
})

describe('editViews, GitHub', () => {
  test('writes with the sha, retries once on a conflict, then gives up with 409', async () => {
    const gh = fakeGithub({ 'soii.config.yml': CONFIG }, 1)
    const r = await editViews(readEnv(GH), { action: 'add', workspace: 'projects', tab: { title: 'Active', view: 'list', query: {} } }, { fetch: gh.fetch, git: okGit })
    expect(r).toMatchObject({ ok: true, via: 'github' })
    expect(gh.files['soii.config.yml']).toContain('title: Sam (laptop)')
    expect(gh.files['soii.config.yml']).toContain('id: active')
    const busy = fakeGithub({ 'soii.config.yml': CONFIG }, 2)
    const r2 = await editViews(readEnv(GH), { action: 'add', workspace: 'projects', tab: { title: 'X', view: 'list', query: {} } }, { fetch: busy.fetch, git: okGit })
    expect(r2).toMatchObject({ ok: false, status: 409, error: 'conflict' })
  })
  test('creates the file on GitHub when the vault has none', async () => {
    const gh = fakeGithub({})
    const r = await editViews(readEnv(GH), { action: 'add', workspace: 'goals', tab: { title: 'Big', view: 'list', query: {} } }, { fetch: gh.fetch, git: okGit })
    expect(r.ok).toBe(true)
    expect(gh.files['soii.config.yml']).toContain('id: big')
  })
})
