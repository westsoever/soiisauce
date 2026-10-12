// app/server/log-note.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { NoteMeta } from '../lib/types'
import { readEnv } from './env'
import type { FetchLike } from './github-oauth'
import { logNote, parseLogRequest } from './log-note'
import type { RunGit } from './sync'

const D = '2026-10-12'
const GH = { VAULT_REPO: 'me/vault', VAULT_WRITE_TOKEN: 'ghp_WRITE', VAULT_REF: 'main' }
const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-log-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))

const meta = (path: string, title: string, extra: Partial<NoteMeta> = {}): NoteMeta => ({
  id: path.replace(/\.md$/, ''),
  title,
  path,
  folder: path.slice(0, path.lastIndexOf('/')),
  type: null,
  tags: [],
  date: null,
  updated: null,
  frontmatter: {},
  excerpt: '',
  image: null,
  wordCount: 1,
  ...extra
})
const ANNA = meta('05-Knowledge/People/Anna.md', 'Anna', { type: 'person', frontmatter: { type: 'person' } })
const DUNE = meta('04-Resources/Library/Books/Dune.md', 'Dune', { type: 'book', frontmatter: { type: 'book', status: 'reading' } })
const NOTES = [ANNA, DUNE]

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
    if (!body.sha && path in files) return new Response('{}', { status: 422 })
    if (body.sha && body.sha !== shas.get(path)) return new Response('{}', { status: 409 })
    if (body.sha && stale > 0) {
      stale--
      files[path] += '- 2026-10-12 — from the laptop\n'
      shas.set(path, `sha${n++}`)
      return new Response('{}', { status: 409 })
    }
    files[path] = Buffer.from(body.content, 'base64').toString('utf8')
    shas.set(path, `sha${n++}`)
    return Response.json({ commit: { html_url: `https://github.com/me/vault/commit/${n}` } }, { status: 201 })
  }
  return { fetch, files, calls }
}

const appendBody = (extra: Record<string, unknown> = {}) => ({ mode: 'append', kind: 'conversation', path: ANNA.path, values: {}, text: 'Coffee at Original.', date: D, how: 'met', ...extra })

describe('parseLogRequest', () => {
  test('rejects bad shapes, kinds, dates, hows and sizes', () => {
    const bad = [
      null,
      'x',
      [],
      { mode: 'new', kind: 'nope', title: 'x', date: D },
      { mode: 'edit', kind: 'book', title: 'x', date: D },
      { mode: 'new', kind: 'book', title: 'x', date: '2026-02-30' },
      { mode: 'new', kind: 'book', title: 'x', date: D, text: 'x'.repeat(20_001) },
      { mode: 'new', kind: 'book', title: 'x', date: D, how: 'met' },
      appendBody({ how: 'shouted' }),
      { mode: 'new', kind: 'book', title: 'x'.repeat(201), date: D },
      { mode: 'new', kind: 'book', title: 'x', date: D, values: [] }
    ]
    for (const body of bad) expect(parseLogRequest(body)).toMatchObject({ ok: false, status: 400 })
  })

  test('validates field values by kind and drops unknown keys', () => {
    expect(parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: { status: 'loved' } })).toMatchObject({ ok: false, error: 'bad_value' })
    expect(parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: { rating: '6' } })).toMatchObject({ ok: false, error: 'bad_value' })
    expect(parseLogRequest({ mode: 'new', kind: 'expense', title: '', date: D, values: { amount: 'lots' } })).toMatchObject({ ok: false, error: 'bad_value' })
    expect(parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: { started: 'yesterday' } })).toMatchObject({ ok: false, error: 'bad_value' })
    expect(parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: { author: 'x'.repeat(501) } })).toMatchObject({ ok: false, error: 'bad_value' })
    const ok = parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: JSON.parse('{"status":"reading","soii":"hidden","__proto__":"x","author":"  "}') })
    expect(ok.ok && ok.req.values).toEqual({ status: 'reading' })
  })

  test('collection and category: on new notes and appends, de-duplicated, at most 5 of at most 60 characters', () => {
    const ok = parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: { collection: 'StartupBooks, startupbooks', category: 'Biographies' } })
    expect(ok.ok && ok.req.values).toEqual({ collection: 'StartupBooks', category: 'Biographies' })
    expect(parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: { category: 'a,b,c,d,e,f' } })).toMatchObject({ ok: false, error: 'bad_value', message: 'Category takes at most 5 values.' })
    expect(parseLogRequest({ mode: 'new', kind: 'movie', title: 'Heat', date: D, values: { collection: 'x'.repeat(61) } })).toMatchObject({ ok: false, error: 'bad_value' })
    const append = parseLogRequest({ ...appendBody(), kind: 'book', path: DUNE.path, how: null, values: { collection: 'StartupBooks' } })
    expect(append.ok && append.req.values).toEqual({ collection: 'StartupBooks' })
  })

  test('appends only accept quick fields', () => {
    const r = parseLogRequest({ ...appendBody(), kind: 'book', path: DUNE.path, how: null, values: { status: 'finished', author: 'Someone' } })
    expect(r.ok && r.req.values).toEqual({ status: 'finished' })
  })

  test('needs a title (an expense needs an amount), and an append needs text or a change', () => {
    expect(parseLogRequest({ mode: 'new', kind: 'book', title: '  ', date: D })).toMatchObject({ ok: false, error: 'title_required' })
    expect(parseLogRequest({ mode: 'new', kind: 'expense', title: 'Lunch', date: D })).toMatchObject({ ok: false, error: 'amount_required' })
    expect(parseLogRequest(appendBody({ text: '  ' }))).toMatchObject({ ok: false, error: 'empty' })
    expect(parseLogRequest({ mode: 'append', kind: 'expense', path: 'x.md', date: D, text: 'x' })).toMatchObject({ ok: false, error: 'cannot_append' })
  })
})

describe('logNote on GitHub', () => {
  const env = readEnv(GH)

  test('says so when writing is not configured', async () => {
    expect(await logNote(readEnv({}), appendBody(), { fetch: noFetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 501 })
  })

  test('new: creates the file without a sha', async () => {
    const gh = fakeGithub({})
    const r = await logNote(env, { mode: 'new', kind: 'book', title: 'Project Hail Mary', values: { status: 'reading' }, text: 'Fun.', date: D }, { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, mode: 'new', via: 'github', path: '04-Resources/Library/Books/Project Hail Mary.md', pulled: null, warning: null })
    expect(gh.calls.map(c => c.method)).toEqual(['PUT'])
    expect(gh.calls[0].body?.sha).toBeUndefined()
    expect(gh.calls[0].body?.message).toBe('soii log: book "Project Hail Mary"')
    expect(gh.files['04-Resources/Library/Books/Project Hail Mary.md']).toContain('status: reading')
  })

  test('new: an existing file is a 409 carrying its path, and is not changed', async () => {
    const gh = fakeGithub({ [DUNE.path]: 'original' })
    const r = await logNote(env, { mode: 'new', kind: 'book', title: 'Dune', date: D }, { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'exists', path: DUNE.path })
    expect(gh.files[DUNE.path]).toBe('original')
  })

  test('append: reads, adds the bullet, writes with the sha', async () => {
    const gh = fakeGithub({ [ANNA.path]: '---\ntype: person\n---\n\n# Anna\n\n## Notes & dated interactions\n- 2026-09-01 — walk\n\n## Sources\n- x\n' })
    const r = await logNote(env, appendBody(), { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, mode: 'append', via: 'github', path: ANNA.path })
    expect(gh.calls.map(c => c.method)).toEqual(['GET', 'PUT'])
    expect(gh.calls[1].body?.sha).toBe('sha1')
    expect(gh.files[ANNA.path]).toContain('- 2026-09-01 — walk\n- 2026-10-12 (met) — Coffee at Original.\n\n## Sources')
  })

  test('append: field changes patch the frontmatter and fill the finished date', async () => {
    const gh = fakeGithub({ [DUNE.path]: '---\ntype: book\nstatus: reading\n---\n\n# Dune\n' })
    const r = await logNote(env, { mode: 'append', kind: 'book', path: DUNE.path, values: { status: 'finished', rating: '5' }, text: '', date: D }, { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true })
    expect(gh.files[DUNE.path]).toBe('---\ntype: book\nstatus: finished\nrating: 5\nfinished: 2026-10-12\n---\n\n# Dune\n\n## Log\n\n- 2026-10-12 — status → finished, rating → 5, finished → 2026-10-12\n')
  })

  test('append: a category change is patched as a block list', async () => {
    const gh = fakeGithub({ [DUNE.path]: '---\ntype: book\nstatus: reading\ncategory:\n  - Biographies\n---\n\n# Dune\n' })
    const r = await logNote(env, { mode: 'append', kind: 'book', path: DUNE.path, values: { category: 'Leadership & Management' }, text: 'Great on delegation.', date: D }, { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true })
    expect(gh.files[DUNE.path]).toBe('---\ntype: book\nstatus: reading\ncategory:\n  - Leadership & Management\n---\n\n# Dune\n\n## Log\n\n- 2026-10-12 — Great on delegation.\n')
  })

  test('append: a concurrent edit is re-read and retried once, keeping both', async () => {
    const gh = fakeGithub({ [DUNE.path]: '# Dune\n\n## Log\n' }, 1)
    const r = await logNote(env, { mode: 'append', kind: 'book', path: DUNE.path, values: {}, text: 'Chapter 3.', date: D }, { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true })
    expect(gh.calls.map(c => c.method)).toEqual(['GET', 'PUT', 'GET', 'PUT'])
    expect(gh.files[DUNE.path]).toContain('from the laptop')
    expect(gh.files[DUNE.path]).toContain('- 2026-10-12 — Chapter 3.')
  })

  test('append: two concurrent edits in a row give up with a conflict', async () => {
    const gh = fakeGithub({ [DUNE.path]: '# Dune\n' }, 2)
    const r = await logNote(env, { mode: 'append', kind: 'book', path: DUNE.path, values: {}, text: 'x', date: D }, { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'conflict' })
  })

  test('append: only notes in the compiled index, of the right type', async () => {
    const gh = fakeGithub({})
    expect(await logNote(env, appendBody({ path: '05-Knowledge/People/Ghost.md' }), { fetch: gh.fetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404, error: 'not_found' })
    expect(await logNote(env, appendBody({ path: DUNE.path }), { fetch: gh.fetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 400, error: 'wrong_type' })
    expect(gh.calls).toEqual([])
  })

  test('append: a note deleted on GitHub since the last build is "gone", and nothing is created', async () => {
    const gh = fakeGithub({})
    const r = await logNote(env, appendBody(), { fetch: gh.fetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: false, status: 404, error: 'gone' })
    expect(gh.calls.map(c => c.method)).toEqual(['GET'])
  })

  test('locally, a GitHub commit is pulled into VAULT_PATH', async () => {
    const vault = tmp()
    mkdirSync(join(vault, '.git'))
    const seen: string[][] = []
    const git: RunGit = async (_cwd, args) => {
      seen.push(args)
      return { code: 0, out: 'Fast-forward' }
    }
    const gh = fakeGithub({ [ANNA.path]: '# Anna\n' })
    const r = await logNote(readEnv({ ...GH, VAULT_PATH: vault }), appendBody(), { fetch: gh.fetch, git, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, pulled: true, warning: null })
    expect(seen).toEqual([['pull', '--ff-only']])
  })

  test('a failed pull still reports the commit, with a warning', async () => {
    const vault = tmp()
    mkdirSync(join(vault, '.git'))
    const git: RunGit = async () => ({ code: 1, out: 'error: Your local changes to the following files would be overwritten by merge' })
    const gh = fakeGithub({ [ANNA.path]: '# Anna\n' })
    const r = await logNote(readEnv({ ...GH, VAULT_PATH: vault }), appendBody(), { fetch: gh.fetch, git, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, via: 'github', pulled: false })
    expect(r.ok && r.warning).toContain('overwritten')
  })
})

describe('logNote on local disk', () => {
  function vault(withGit: boolean) {
    const root = tmp()
    if (withGit) mkdirSync(join(root, '.git'))
    const put = (path: string, content: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    return { root, put, env: readEnv({ VAULT_PATH: root }) }
  }

  test('new: writes the file and commits only that path', async () => {
    const v = vault(true)
    const seen: string[][] = []
    const git: RunGit = async (_cwd, args) => {
      seen.push(args)
      return { code: 0, out: '' }
    }
    const r = await logNote(v.env, { mode: 'new', kind: 'goal', title: 'Run a marathon', values: { horizon: 'life' }, text: '', date: D }, { fetch: noFetch, git, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, via: 'local', path: '03-Areas/Goals/Run a marathon.md', pulled: null })
    expect(readFileSync(join(v.root, '03-Areas/Goals/Run a marathon.md'), 'utf8')).toContain('horizon: life')
    expect(seen).toEqual([
      ['add', '--', '03-Areas/Goals/Run a marathon.md'],
      ['commit', '-m', 'soii log: goal "Run a marathon"', '--only', '--', '03-Areas/Goals/Run a marathon.md']
    ])
  })

  test('new: never overwrites', async () => {
    const v = vault(false)
    v.put('03-Areas/Goals/Run.md', 'mine')
    const r = await logNote(v.env, { mode: 'new', kind: 'goal', title: 'Run', date: D }, { fetch: noFetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'exists' })
    expect(readFileSync(join(v.root, '03-Areas/Goals/Run.md'), 'utf8')).toBe('mine')
  })

  test('append: edits the file; without a git repo it says nothing was committed', async () => {
    const v = vault(false)
    v.put(ANNA.path, '# Anna\n')
    const r = await logNote(v.env, appendBody(), { fetch: noFetch, git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, via: 'local' })
    expect(r.ok && r.warning).toContain('not a git repository')
    expect(readFileSync(join(v.root, ANNA.path), 'utf8')).toBe('# Anna\n\n## Notes & dated interactions\n\n- 2026-10-12 (met) — Coffee at Original.\n')
  })

  test('append: a file missing on disk is "gone"', async () => {
    const v = vault(false)
    expect(await logNote(v.env, appendBody(), { fetch: noFetch, git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404, error: 'gone' })
    expect(existsSync(join(v.root, ANNA.path))).toBe(false)
  })

  test('a failed commit keeps the file and warns', async () => {
    const v = vault(true)
    v.put(ANNA.path, '# Anna\n')
    const git: RunGit = async (_cwd, args) => (args[0] === 'commit' ? { code: 1, out: 'fatal: unable to auto-detect email address' } : { code: 0, out: '' })
    const r = await logNote(v.env, appendBody(), { fetch: noFetch, git, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true })
    expect(r.ok && r.warning).toContain('unable to auto-detect email')
  })
})
