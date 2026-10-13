// app/server/edit-properties.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NoteMeta } from '../lib/types'
import { editProperty, parsePropertyRequest } from './edit-properties'
import { readEnv } from './env'
import type { RunGit } from './sync'

const D = '2026-10-12'
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

const noGit: RunGit = async () => {
  throw new Error('git should not be called')
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
    expect(await editProperty(readEnv({}), body(), { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 501 })
  })

  test('only edits markdown notes in the compiled index', async () => {
    const env = readEnv({ VAULT_PATH: tmp() })
    expect(await editProperty(env, body({ path: 'Elsewhere/Nope.md' }), { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404 })
    expect(await editProperty(env, body({ path: 'Pics/x.png' }), { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404 })
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
    const r = await editProperty(readEnv({ VAULT_PATH: root }), body({ key: 'birthday', value: '1990-05-01' }), { git: runGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, path: PATH })
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
    expect(await editProperty(readEnv({ VAULT_PATH: root }), body(), { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 422 })
    expect(readFileSync(join(root, PATH), 'utf8')).toBe(broken)
  })
})
