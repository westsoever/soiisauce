// app/server/log-note.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { NoteMeta } from '../lib/types'
import { readEnv } from './env'
import { logNote, parseLogRequest } from './log-note'
import type { RunGit } from './sync'

const D = '2026-10-12'
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

const noGit: RunGit = async () => {
  throw new Error('git should not be called')
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
    const ok = parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: { collection: 'ReadingList, readinglist', category: 'Biographies' } })
    expect(ok.ok && ok.req.values).toEqual({ collection: 'ReadingList', category: 'Biographies' })
    expect(parseLogRequest({ mode: 'new', kind: 'book', title: 'Dune', date: D, values: { category: 'a,b,c,d,e,f' } })).toMatchObject({ ok: false, error: 'bad_value', message: 'Category takes at most 5 values.' })
    expect(parseLogRequest({ mode: 'new', kind: 'movie', title: 'Heat', date: D, values: { collection: 'x'.repeat(61) } })).toMatchObject({ ok: false, error: 'bad_value' })
    const append = parseLogRequest({ ...appendBody(), kind: 'book', path: DUNE.path, how: null, values: { collection: 'ReadingList' } })
    expect(append.ok && append.req.values).toEqual({ collection: 'ReadingList' })
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
  const read = (v: { root: string }, path: string) => readFileSync(join(v.root, path), 'utf8')

  test('says so when writing is not configured', async () => {
    expect(await logNote(readEnv({}), appendBody(), { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 501 })
  })

  test('new: writes the file and commits only that path', async () => {
    const v = vault(true)
    const seen: string[][] = []
    const git: RunGit = async (_cwd, args) => {
      seen.push(args)
      return { code: 0, out: '' }
    }
    const r = await logNote(v.env, { mode: 'new', kind: 'goal', title: 'Run a marathon', values: { horizon: 'life' }, text: '', date: D }, { git, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, mode: 'new', path: '03-Areas/Goals/Run a marathon.md' })
    expect(readFileSync(join(v.root, '03-Areas/Goals/Run a marathon.md'), 'utf8')).toContain('horizon: life')
    expect(seen).toEqual([
      ['add', '--', '03-Areas/Goals/Run a marathon.md'],
      ['commit', '-m', 'soii log: goal "Run a marathon"', '--only', '--', '03-Areas/Goals/Run a marathon.md']
    ])
  })

  test('new: never overwrites, takes the next free name instead', async () => {
    const v = vault(false)
    v.put('03-Areas/Goals/Run.md', 'mine')
    v.put('03-Areas/Goals/Run 2.md', 'mine too')
    const r = await logNote(v.env, { mode: 'new', kind: 'goal', title: 'Run', date: D }, { git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, mode: 'new', path: '03-Areas/Goals/Run 3.md' })
    expect(readFileSync(join(v.root, '03-Areas/Goals/Run.md'), 'utf8')).toBe('mine')
    expect(readFileSync(join(v.root, '03-Areas/Goals/Run 3.md'), 'utf8')).toContain('# Run 3')
  })

  test('new: a Note without a title is named after its first line', async () => {
    const v = vault(false)
    const r = await logNote(v.env, { mode: 'new', kind: 'note', title: '', text: '# Idea for the weekend\nHike up the hill.', date: D }, { git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, mode: 'new', path: '00-Inbox/Idea for the weekend.md' })
    expect(read(v, '00-Inbox/Idea for the weekend.md')).toEndWith('# Idea for the weekend\n\nHike up the hill.\n')
    const again = await logNote(v.env, { mode: 'new', kind: 'note', title: '', text: 'Idea for the weekend\nSwim.', date: D }, { git: noGit, notes: () => NOTES })
    expect(again).toMatchObject({ ok: true, path: '00-Inbox/Idea for the weekend 2.md' })
    expect(read(v, '00-Inbox/Idea for the weekend 2.md')).toEndWith('# Idea for the weekend 2\n\nSwim.\n')
    expect(await logNote(v.env, { mode: 'new', kind: 'note', title: '', text: '  ', date: D }, { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, error: 'empty' })
    expect(await logNote(v.env, { mode: 'new', kind: 'book', title: '', text: 'x', date: D }, { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, error: 'title_required' })
  })

  test('append: adds the bullet at the end of its section', async () => {
    const v = vault(false)
    v.put(ANNA.path, '---\ntype: person\n---\n\n# Anna\n\n## Notes & dated interactions\n- 2026-09-01 — walk\n\n## Sources\n- x\n')
    const r = await logNote(v.env, appendBody(), { git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, mode: 'append', path: ANNA.path })
    expect(read(v, ANNA.path)).toContain('- 2026-09-01 — walk\n- 2026-10-12 (met) — Coffee at Original.\n\n## Sources')
  })

  test('append: field changes patch the frontmatter and fill the finished date', async () => {
    const v = vault(false)
    v.put(DUNE.path, '---\ntype: book\nstatus: reading\n---\n\n# Dune\n')
    const r = await logNote(v.env, { mode: 'append', kind: 'book', path: DUNE.path, values: { status: 'finished', rating: '5' }, text: '', date: D }, { git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true })
    expect(read(v, DUNE.path)).toBe('---\ntype: book\nstatus: finished\nrating: 5\nfinished: 2026-10-12\n---\n\n# Dune\n\n## Log\n\n- 2026-10-12 — status → finished, rating → 5, finished → 2026-10-12\n')
  })

  test('append: a category change is patched as a block list', async () => {
    const v = vault(false)
    v.put(DUNE.path, '---\ntype: book\nstatus: reading\ncategory:\n  - Biographies\n---\n\n# Dune\n')
    const r = await logNote(v.env, { mode: 'append', kind: 'book', path: DUNE.path, values: { category: 'Leadership & Management' }, text: 'Great on delegation.', date: D }, { git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true })
    expect(read(v, DUNE.path)).toBe('---\ntype: book\nstatus: reading\ncategory:\n  - Leadership & Management\n---\n\n# Dune\n\n## Log\n\n- 2026-10-12 — Great on delegation.\n')
  })

  test('append: only notes in the compiled index, of the right type', async () => {
    const v = vault(false)
    v.put(DUNE.path, '# Dune\n')
    expect(await logNote(v.env, appendBody({ path: '05-Knowledge/People/Ghost.md' }), { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404, error: 'not_found' })
    expect(await logNote(v.env, appendBody({ path: DUNE.path }), { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 400, error: 'wrong_type' })
    expect(read(v, DUNE.path)).toBe('# Dune\n')
  })

  test('append: edits the file; without a git repo it says nothing was committed', async () => {
    const v = vault(false)
    v.put(ANNA.path, '# Anna\n')
    const r = await logNote(v.env, appendBody(), { git: noGit, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true, mode: 'append' })
    expect(r.ok && r.warning).toContain('not a git repository')
    expect(readFileSync(join(v.root, ANNA.path), 'utf8')).toBe('# Anna\n\n## Notes & dated interactions\n\n- 2026-10-12 (met) — Coffee at Original.\n')
  })

  test('append: a file missing on disk is "gone"', async () => {
    const v = vault(false)
    expect(await logNote(v.env, appendBody(), { git: noGit, notes: () => NOTES })).toMatchObject({ ok: false, status: 404, error: 'gone' })
    expect(existsSync(join(v.root, ANNA.path))).toBe(false)
  })

  test('a failed commit keeps the file and warns', async () => {
    const v = vault(true)
    v.put(ANNA.path, '# Anna\n')
    const git: RunGit = async (_cwd, args) => (args[0] === 'commit' ? { code: 1, out: 'fatal: unable to auto-detect email address' } : { code: 0, out: '' })
    const r = await logNote(v.env, appendBody(), { git, notes: () => NOTES })
    expect(r).toMatchObject({ ok: true })
    expect(r.ok && r.warning).toContain('git config --global user.email')
  })
})
