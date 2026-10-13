// D76: in local mode every write soii makes is a local commit of exactly the file it wrote. One test per write path, with real
// git against a vault that has the owner's own loose work in it, which must never be swept into soii's commits.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSoiiApp } from './app'
import { makeGeneratedFixture } from './test-fixture'

const dirs: string[] = []
const saved: Record<string, string | undefined> = {}
const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
beforeAll(() => {
  for (const [k, v] of Object.entries(IDENTITY)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).replace(/\n+$/, '')

/** A vault repo with a tracked note, a note edited but not committed, one staged, and one never added: the owner's loose work. */
function vault() {
  const root = mkdtempSync(join(tmpdir(), 'soii-lc-'))
  dirs.push(root)
  git(root, 'init', '-q', '-b', 'main')
  mkdirSync(join(root, 'People'), { recursive: true })
  writeFileSync(join(root, 'People/Anna.md'), '---\nrelationship: friend\n---\n# Anna\n\n## Notes & dated interactions\n')
  writeFileSync(join(root, 'Edited.md'), 'one\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'first')
  writeFileSync(join(root, 'Edited.md'), 'one, then edited by me\n')
  writeFileSync(join(root, 'Staged.md'), 'staged by me\n')
  git(root, 'add', 'Staged.md')
  mkdirSync(join(root, '04-Resources/Library/Recipes'), { recursive: true })
  writeFileSync(join(root, '04-Resources/Library/Recipes/asdf.md'), 'never committed\n')
  return root
}

const LOOSE = ['?? 04-Resources/Library/Recipes/asdf.md', 'A  Staged.md', ' M Edited.md']
const status = (root: string) => git(root, 'status', '--porcelain', '-uall').split('\n').sort()
const lastFiles = (root: string) => git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()
const lastMessage = (root: string) => git(root, 'log', '-1', '--format=%s')

function post(root: string, path: string, body: unknown) {
  const app = createSoiiApp({ env: { SOII_LOCAL: '1', VAULT_PATH: root }, generatedDir: makeGeneratedFixture() })
  return app.fetch(
    new Request(`http://localhost:5011${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'localhost:5011', Origin: 'http://localhost:5011' },
      body: JSON.stringify(body)
    })
  )
}

describe('local mode commits every write, and only that file', () => {
  test('Add (POST /api/notes): "soii: add recipe …"', async () => {
    const root = vault()
    const before = git(root, 'rev-parse', 'HEAD')
    const res = await post(root, '/api/notes', { type: 'recipe', values: { title: 'Pasta al limone' } })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { path: string; warning: string | null }
    expect(body).toMatchObject({ path: '04-Resources/Library/Recipes/Pasta al limone.md' })
    expect(body.warning).toContain('Committed')
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(before)
    expect(lastMessage(root)).toBe('soii: add recipe "Pasta al limone"')
    expect(lastFiles(root)).toEqual(['04-Resources/Library/Recipes/Pasta al limone.md'])
    expect(status(root)).toEqual([...LOOSE].sort())
  })

  test('Add a book: the commit names the kind of note', async () => {
    const root = vault()
    await post(root, '/api/notes', { type: 'book', values: { title: 'Dune' } })
    expect(lastMessage(root)).toBe('soii: add book "Dune"')
    expect(status(root)).toEqual([...LOOSE].sort())
  })

  test('Add that cannot commit still saves, and says so', async () => {
    const root = vault()
    mkdirSync(join(root, '.git/hooks'), { recursive: true })
    writeFileSync(join(root, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n')
    execFileSync('chmod', ['+x', join(root, '.git/hooks/pre-commit')])
    const res = await post(root, '/api/notes', { type: 'book', values: { title: 'Dune' } })
    expect(res.status).toBe(201)
    expect(((await res.json()) as { warning: string }).warning).toContain("didn't commit")
  })

  test('Add in a folder that is not a git repo still saves', async () => {
    const root = mkdtempSync(join(tmpdir(), 'soii-lc-nogit-'))
    dirs.push(root)
    const res = await post(root, '/api/notes', { type: 'book', values: { title: 'Dune' } })
    expect(res.status).toBe(201)
    expect(((await res.json()) as { warning: string }).warning).toContain('not a git repository')
  })

  test('Log, a new note: "soii log: …"', async () => {
    const root = vault()
    const res = await post(root, '/api/log', { mode: 'new', kind: 'book', title: 'Dune', values: { status: 'reading' }, text: '', date: '2026-10-12', how: null })
    expect(res.status).toBe(201)
    expect(lastMessage(root)).toMatch(/^soii log: /)
    expect(lastFiles(root)).toEqual(['04-Resources/Library/Books/Dune.md'])
    expect(status(root)).toEqual([...LOOSE].sort())
  })

  test('Log, a line on an existing note', async () => {
    const root = vault()
    const res = await post(root, '/api/log', { mode: 'append', kind: 'conversation', path: 'People/Anna.md', values: {}, text: 'Lunch.', date: '2026-10-12', how: 'met' })
    expect(res.status).toBe(201)
    expect(lastMessage(root)).toMatch(/^soii log: /)
    expect(lastFiles(root)).toEqual(['People/Anna.md'])
    expect(status(root)).toEqual([...LOOSE].sort())
  })

  test('a property edit', async () => {
    const root = vault()
    const res = await post(root, '/api/notes/properties', { path: 'People/Anna.md', key: 'relationship', value: 'close friend', date: '2026-10-12' })
    expect(res.status).toBe(200)
    expect(lastFiles(root)).toEqual(['People/Anna.md'])
    expect(status(root)).toEqual([...LOOSE].sort())
  })

  test('Sync writes no notes of its own: it pulls, then pushes what is already committed', async () => {
    const root = vault()
    const before = git(root, 'rev-parse', 'HEAD')
    await post(root, '/api/sync', {}) // no upstream here: nothing to pull or push, and no commit of its own
    expect(git(root, 'rev-parse', 'HEAD')).toBe(before)
    expect(status(root)).toEqual([...LOOSE].sort())
  })
})
