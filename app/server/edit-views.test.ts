// app/server/edit-views.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { editViews, parseAddRequest, parseUpdateRequest } from './edit-views'
import { readEnv } from './env'
import type { RunGit } from './sync'

const CONFIG = 'title: Sam\nworkspaces:\n  - id: projects\n    title: Projects\n    tabs:\n      - { id: board, title: Board, view: board, query: { type: project } }\n'
const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-views-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
const gitLog: { args: string[] }[] = []
const okGit: RunGit = async (_cwd, args) => {
  gitLog.push({ args })
  return { code: 0, out: '' }
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
    const r = await editViews(env, { action: 'add', workspace: 'projects', tab: { title: 'Active', view: 'list', query: { type: 'project' } } }, { git: okGit })
    expect(r).toMatchObject({ ok: true, workspace: 'projects', tabId: 'active', title: 'Active' })
    expect(readFileSync(join(root, 'soii.config.yml'), 'utf8')).toContain('id: active')
    // commitLocal only commits when the folder is a git repo; here it isn't, so it warns instead.
    expect((r as { warning: string }).warning).toContain('not a git repository')
  })
  test('creates soii.config.yml when there is none, and edits soii.config.yaml when that is what exists', async () => {
    const a = tmp()
    await editViews(readEnv({ SOII_LOCAL: '1', VAULT_PATH: a }), { action: 'add', workspace: 'goals', tab: { title: 'Big', view: 'list', query: { type: 'goal' } } }, { git: okGit })
    expect(existsSync(join(a, 'soii.config.yml'))).toBe(true)
    const b = tmp()
    writeFileSync(join(b, 'soii.config.yaml'), CONFIG)
    await editViews(readEnv({ SOII_LOCAL: '1', VAULT_PATH: b }), { action: 'remove', workspace: 'people', tabId: 'network' }, { git: okGit })
    expect(existsSync(join(b, 'soii.config.yml'))).toBe(false)
    expect(readFileSync(join(b, 'soii.config.yaml'), 'utf8')).toContain('id: people')
  })
  test('a broken config is refused and left alone', async () => {
    const root = tmp()
    writeFileSync(join(root, 'soii.config.yml'), 'title: [unclosed\n')
    const r = await editViews(readEnv({ SOII_LOCAL: '1', VAULT_PATH: root }), { action: 'remove', workspace: 'projects', tabId: 'board' }, { git: okGit })
    expect(r).toMatchObject({ ok: false, status: 400, error: 'bad_config' })
    expect(readFileSync(join(root, 'soii.config.yml'), 'utf8')).toBe('title: [unclosed\n')
  })
  test('update applies query and sort in one write', async () => {
    const root = tmp()
    writeFileSync(join(root, 'soii.config.yml'), CONFIG)
    const r = await editViews(
      readEnv({ SOII_LOCAL: '1', VAULT_PATH: root }),
      { action: 'update', workspace: 'projects', tabId: 'board', query: { type: 'project', where: { area: 'work' } }, sort: [{ field: 'title', dir: 'asc' }] },
      { git: okGit }
    )
    expect(r.ok).toBe(true)
    const text = readFileSync(join(root, 'soii.config.yml'), 'utf8')
    expect(text).toContain('area: work')
    expect(text).toContain('field: title')
  })
  test('501 with no write target', async () => {
    const r = await editViews(readEnv({}), { action: 'remove', workspace: 'projects', tabId: 'board' }, { git: okGit })
    expect(r).toMatchObject({ ok: false, status: 501 })
  })
})
