// app/server/write-note.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from './env'
import { canWrite, writeNote } from './write-note'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-write-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))

describe('canWrite', () => {
  test('needs the vault folder', () => {
    expect(canWrite(readEnv({ VAULT_PATH: '/v' }))).toBe(true)
    expect(canWrite(readEnv({}))).toBe(false)
  })
})

describe('writeNote validation', () => {
  const env = readEnv({ VAULT_PATH: '/nonexistent-soii-vault' })
  test('rejects unknown types, odd bodies and a missing title', async () => {
    for (const body of [null, 'x', {}, { type: 'nope', values: {} }, { type: 'book', values: [] }, { type: 'book', values: { title: 5 } }, { type: '__proto__', values: {} }]) {
      const r = await writeNote(env, body)
      expect(r).toMatchObject({ ok: false, status: 400 })
    }
    expect(await writeNote(env, { type: 'book', values: { title: '   ' } })).toMatchObject({ ok: false, error: 'title_required' })
  })

  test('rejects oversized values', async () => {
    expect(await writeNote(env, { type: 'book', values: { title: 'x'.repeat(501) } })).toMatchObject({ ok: false, status: 400 })
  })

  test('says so when writing is not configured', async () => {
    expect(await writeNote(readEnv({}), { type: 'book', values: { title: 'Dune' } })).toMatchObject({ ok: false, status: 501 })
  })
})

describe('writeNote to local disk', () => {
  test('creates the folder, writes the frontmatter, and refuses to overwrite', async () => {
    const root = tmp()
    const env = readEnv({ VAULT_PATH: root })
    const body = { type: 'book', values: { title: 'Dune', author: 'Frank Herbert', status: 'want' } }
    const first = await writeNote(env, body)
    expect(first).toEqual({ ok: true, path: '04-Resources/Library/Books/Dune.md', warning: expect.stringContaining('not a git repository') })
    const text = readFileSync(join(root, '04-Resources/Library/Books/Dune.md'), 'utf8')
    expect(text).toMatch(/^---\ntype: book\ntitle: Dune\nauthor: Frank Herbert\nisbn:\ncover:\nstatus: want\n/)
    expect(text).toMatch(/\ncreated: \d{4}-\d{2}-\d{2}\n/)
    expect(text.endsWith('---\n\n# Dune\n')).toBe(true)
    expect(await writeNote(env, body)).toMatchObject({ ok: false, status: 409, error: 'exists' })
  })

  test('a newline in a value cannot add frontmatter keys', async () => {
    const root = tmp()
    await writeNote(readEnv({ VAULT_PATH: root }), { type: 'book', values: { title: 'Dune', author: 'x\nsoii: hidden' } })
    const text = readFileSync(join(root, '04-Resources/Library/Books/Dune.md'), 'utf8')
    expect(text.split('\n').filter(l => l.startsWith('soii:'))).toEqual([])
  })

  test('nothing is written outside the vault for a hostile title', async () => {
    const root = tmp()
    await writeNote(readEnv({ VAULT_PATH: root }), { type: 'book', values: { title: '../../escape' } })
    expect(existsSync(join(root, '..', 'escape.md'))).toBe(false)
    expect(existsSync(join(root, '04-Resources/Library/Books/.. escape.md'))).toBe(true)
  })
})

describe('writeNote collection and category', () => {
  test('writes them as YAML lists, de-duplicated', async () => {
    const dir = tmp()
    const r = await writeNote(readEnv({ VAULT_PATH: dir }), { type: 'movie', values: { title: 'Heat', collection: 'Criterion, criterion', category: ' Crime ,Thriller' } })
    expect(r).toMatchObject({ ok: true })
    expect(readFileSync(join(dir, '04-Resources/Library/Movies/Heat.md'), 'utf8')).toBe(
      '---\ntype: movie\ntitle: Heat\ncollection:\n  - Criterion\ncategory:\n  - Crime\n  - Thriller\n---\n\n# Heat\n'
    )
  })
  test('rejects more than 5 values or a value over 60 characters, and writes nothing', async () => {
    const dir = tmp()
    const env = readEnv({ VAULT_PATH: dir })
    expect(await writeNote(env, { type: 'book', values: { title: 'X', category: 'a,b,c,d,e,f' } })).toMatchObject({ ok: false, status: 400, error: 'bad_value', message: 'Category takes at most 5 values.' })
    expect(await writeNote(env, { type: 'book', values: { title: 'X', collection: 'x'.repeat(61) } })).toMatchObject({ ok: false, status: 400, error: 'bad_value' })
    expect(existsSync(join(dir, '04-Resources/Library/Books/X.md'))).toBe(false)
  })
})
