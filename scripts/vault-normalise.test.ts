import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseFrontmatter } from '../app/vault/frontmatter'
import { resolveConfig } from '../app/lib/merge-config'
import { cadenceDefaults } from '../app/lib/people'
import { authorFromFileName, normaliseVault, planNote, type Change, type Plan } from './vault-normalise'
import { inspectVault } from './check-vault'

const TODAY = '2026-10-12'
const config = resolveConfig({})
const base = { config, cadences: cadenceDefaults(config), today: TODAY }
/** The plan, narrowed to "the note changes". */
function changed(plan: Plan): { content: string; changes: Change[] } {
  if (!('content' in plan)) throw new Error(`expected changes, got ${JSON.stringify(plan)}`)
  return plan
}
const fm = (content: string) => parseFrontmatter(content).data

const dirs: string[] = []
function makeVault(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'soii-norm-'))
  dirs.push(dir)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('authorFromFileName', () => {
  test('takes the author from "Title — Author" (spaced em or en dash) when it looks like a name', () => {
    expect(authorFromFileName('Dune — Frank Herbert')).toBe('Frank Herbert')
    expect(authorFromFileName('Four Thousand Weeks – Oliver Burkeman')).toBe('Oliver Burkeman')
    expect(authorFromFileName('Thinking, Fast and Slow — Daniel Kahneman')).toBe('Daniel Kahneman')
  })
  test('gives up on plain hyphens, long tails and anything that is not a name', () => {
    expect(authorFromFileName('Dune')).toBeNull()
    expect(authorFromFileName('Spider-Man - Origins')).toBeNull()
    expect(authorFromFileName('The Practice of Not Thinking — Ryunosuke Koike Review BookShelf Discovery')).toBeNull()
    expect(authorFromFileName('Notes — 2026 plan')).toBeNull()
    expect(authorFromFileName('A — b — C')).toBeNull()
  })
})

describe('planNote', () => {
  test('adds every missing documented key, empty, and keeps what is there byte for byte', () => {
    const source = '---\ntype: book\nstatus: finished # read it twice\nrating: 5\n---\n\n# Dune\n\nBody stays.\n'
    const plan = changed(planNote({ ...base, source, path: 'Books/Dune.md' }))
    expect(plan.content.startsWith('---\ntype: book\nstatus: finished # read it twice\nrating: 5\n')).toBe(true)
    expect(plan.content.endsWith('---\n\n# Dune\n\nBody stays.\n')).toBe(true)
    const data = fm(plan.content)
    for (const key of ['author', 'cover', 'isbn', 'started', 'finished', 'collection', 'category']) expect(key in data).toBe(true)
    expect(data.rating).toBe(5)
    expect(data.author).toBeNull()
    expect(plan.changes.map(c => c.key)).toEqual(['author', 'cover', 'isbn', 'started', 'finished', 'collection', 'category'])
    expect(plan.content).not.toContain('title:')
  })

  test('never changes a value that is there, empty or not', () => {
    const source = '---\ntype: person\nrelationship: friend\ncadence:\nlast_contact: 2020-01-01\n---\n\n- 2026-09-20: coffee\n'
    const plan = changed(planNote({ ...base, source, path: 'People/Anna.md' }))
    const data = fm(plan.content)
    expect(data.cadence).toBeNull() // an explicit bare `cadence:` means "use the default" (D65)
    expect(String(data.last_contact)).toContain('2020-01-01')
    expect(plan.changes.map(c => c.key)).not.toContain('cadence')
    expect(plan.changes.map(c => c.key)).not.toContain('last_contact')
  })

  test('fills what is safely derivable: author from the file name, last_contact from the newest dated line, cadence from the relationship', () => {
    const book = changed(planNote({ ...base, source: '---\ntype: book\n---\n', path: 'Books/Dune — Frank Herbert.md' }))
    expect(fm(book.content).author).toBe('Frank Herbert')
    expect(book.changes.find(c => c.key === 'author')).toMatchObject({ value: 'Frank Herbert', how: 'derived' })

    const person = changed(planNote({
      ...base,
      source: '---\ntype: person\nrelationship: friend\n---\n\n## Notes & dated interactions\n- 2026-08-13: lunch\n- 2026-09-24: call\n- 2027-01-01: planned trip\n',
      path: 'People/Anna.md'
    }))
    const data = fm(person.content)
    expect(String(data.last_contact)).toContain('2026-09-24')
    expect(data.cadence).toBe('monthly')
  })

  test('a numeric cadence is written as a number', () => {
    const plan = changed(planNote({ ...base, source: '---\ntype: person\nrelationship: mentor\n---\n', path: 'People/Bo.md' }))
    expect(plan.content).toMatch(/^cadence: 60$/m)
    expect(fm(plan.content).cadence).toBe(60)
  })

  test('an author that is already filled is kept; a blank author key is filled from the name', () => {
    const kept = changed(planNote({ ...base, source: '---\ntype: book\nauthor: Someone Else\n---\n', path: 'Books/Dune — Frank Herbert.md' }))
    expect(fm(kept.content).author).toBe('Someone Else')
    const blank = changed(planNote({ ...base, source: '---\ntype: book\nauthor:\n---\n', path: 'Books/Dune — Frank Herbert.md' }))
    expect(fm(blank.content).author).toBe('Frank Herbert')
  })

  test('never guesses status, rating, amounts or dates', () => {
    for (const [type, keys] of [['book', ['status', 'rating']], ['subscription', ['price', 'status']], ['expense', ['amount', 'date']]] as const) {
      const plan = changed(planNote({ ...base, source: `---\ntype: ${type}\n---\n`, path: `X/${type}.md` }))
      for (const key of keys) expect(plan.content).toMatch(new RegExp(`^${key}:$`, 'm'))
    }
  })

  test('adds created from the git date when one is given, and only when the note has none', () => {
    const plan = changed(planNote({ ...base, source: '---\ntype: goal\n---\n', path: 'Goals/Run.md', created: '2025-03-04' }))
    expect(String(fm(plan.content).created)).toContain('2025-03-04')
    const has = changed(planNote({ ...base, source: '---\ntype: goal\ncreated: 2024-01-01\n---\n', path: 'Goals/Run.md', created: '2025-03-04' }))
    expect(String(fm(has.content).created)).toContain('2024-01-01')
  })

  test('typeOnly: an untyped note gets its type and nothing else; typed notes are left alone', () => {
    const plan = changed(planNote({ ...base, source: '# Dune\n\nGreat.\n', path: 'Reading/Dune.md', mapType: 'book', typeOnly: true, created: '2025-03-04' }))
    expect(plan.content).toBe('---\ntype: book\n---\n\n# Dune\n\nGreat.\n')
    expect(plan.changes.map(c => c.key)).toEqual(['type'])
    expect(planNote({ ...base, source: '---\ntype: book\n---\n', path: 'Reading/Dune.md', mapType: 'book', typeOnly: true })).toEqual({ unchanged: true })
  })

  test('types an untyped note from the folder mapping and fills it; an existing type wins over the mapping', () => {
    const plan = changed(planNote({ ...base, source: '# Dune\n\nGreat.\n', path: 'Reading/Dune.md', mapType: 'book' }))
    expect(plan.content.startsWith('---\ntype: book\n')).toBe(true)
    expect(plan.content.endsWith('# Dune\n\nGreat.\n')).toBe(true)
    expect(plan.changes[0]).toMatchObject({ key: 'type', value: 'book', how: 'mapped' })
    const typed = changed(planNote({ ...base, source: '---\ntype: contact\n---\n', path: 'Reading/Anna.md', mapType: 'book' }))
    expect(fm(typed.content).type).toBe('contact')
    expect(fm(typed.content).relationship).toBeNull() // filled as a person (alias of contact), not a book
    expect('isbn' in fm(typed.content)).toBe(false)
  })

  test('a note that had no properties block gets a blank line between it and the body', () => {
    const plan = changed(planNote({ ...base, source: '# Dune\n\nGreat.\n', path: 'Reading/Dune.md', mapType: 'book' }))
    expect(plan.content).toMatch(/\n---\n\n# Dune\n\nGreat\.\n$/)
    const again = planNote({ ...base, source: plan.content, path: 'Reading/Dune.md', mapType: 'book' })
    expect(again).toEqual({ unchanged: true })
  })

  test('leaves types without a field table, hidden, unreadable and base64 notes alone, and says why', () => {
    expect(planNote({ ...base, source: '---\ntype: project\n---\n', path: 'P.md' })).toEqual({ unchanged: true })
    expect(planNote({ ...base, source: '---\nsoii: hidden\ntype: book\n---\n', path: 'H.md' })).toEqual({ skipped: 'hidden' })
    expect(planNote({ ...base, source: '---\ntype: book\n  bad: [\n---\n', path: 'B.md' })).toEqual({ skipped: 'unreadable frontmatter' })
    expect(planNote({ ...base, source: 'LS0tCmRhdGU6IDIwMjYtMDgtMTAKdGFnczogW2RhaWx5XQotLS0KCiMjIFBsYW4KCldyaXRlIHRoZSBwbGFuLgo=', path: 'E.md' })).toEqual({ skipped: 'base64' })
    expect(planNote({ ...base, source: '# Plain\n', path: 'N.md' })).toEqual({ unchanged: true })
  })

  test('is idempotent: running on its own output changes nothing', () => {
    const first = changed(planNote({ ...base, source: '---\ntype: person\nrelationship: mentor\n---\n\n- 2026-09-01: call\n', path: 'People/Bo.md', created: '2025-01-01' }))
    expect(planNote({ ...base, source: first.content, path: 'People/Bo.md', created: '2025-01-01' })).toEqual({ unchanged: true })
  })

  test('sections: adds the empty tracking heading once, "Notes & dated interactions" for people, "Log" for the rest', () => {
    const person = changed(planNote({ ...base, source: '---\ntype: person\n---\n\nHow we met.', path: 'People/A.md', sections: true }))
    expect(person.content.endsWith('How we met.\n\n## Notes & dated interactions\n')).toBe(true)
    const book = changed(planNote({ ...base, source: '---\ntype: book\n---\n\n# Dune\n', path: 'B/Dune.md', sections: true }))
    expect(book.content.endsWith('# Dune\n\n## Log\n')).toBe(true)
    const again = planNote({ ...base, source: book.content, path: 'B/Dune.md', sections: true })
    expect(again).toEqual({ unchanged: true })
    const without = changed(planNote({ ...base, source: '---\ntype: book\n---\n\n# Dune\n', path: 'B/Dune.md' }))
    expect(without.content).not.toContain('## Log')
  })

  test('keeps CRLF line endings', () => {
    const plan = changed(planNote({ ...base, source: '---\r\ntype: book\r\n---\r\n\r\nBody\r\n', path: 'B/X.md' }))
    expect(plan.content).not.toMatch(/[^\r]\n/)
  })
})

describe('normaliseVault', () => {
  const files = {
    'Reading/Dune — Frank Herbert.md': '# Dune\n',
    'Reading/Typed.md': '---\ntype: book\nstatus: want\n---\n\nText\n',
    'Contacts/Anna.md': '---\nrelationship: friend\n---\n\n- 2026-09-01: coffee\n',
    'Random/Idea.md': '# Idea\n',
    'Private/Secret.md': '---\nsoii: hidden\ntype: book\n---\n',
    'Templates/Book.md': '---\ntype: book\nstatus: {{status}}\n---\n',
    'soii.config.yml': 'exclude: ["**/Templates/**"]\n'
  }
  const options = { today: TODAY, typeMap: [['Reading/', 'book'], ['Contacts/', 'person']] as [string, string][] }

  test('a dry run reports the plan and writes nothing', async () => {
    const dir = makeVault(files)
    const report = await normaliseVault(dir, options)
    expect(report.written).toBe(false)
    expect(report.changed.map(c => c.path).sort()).toEqual(['Contacts/Anna.md', 'Reading/Dune — Frank Herbert.md', 'Reading/Typed.md'])
    expect(readFileSync(join(dir, 'Reading/Typed.md'), 'utf8')).toBe(files['Reading/Typed.md'])
    expect(report.skipped).toEqual([{ path: 'Private/Secret.md', reason: 'hidden' }])
  })

  test('--write applies it, and the checker then reports no missing-field for the mapped folders', async () => {
    const dir = makeVault(files)
    const report = await normaliseVault(dir, { ...options, write: true })
    expect(report.written).toBe(true)
    const dune = readFileSync(join(dir, 'Reading/Dune — Frank Herbert.md'), 'utf8')
    expect(dune.startsWith('---\ntype: book\n')).toBe(true)
    expect(fm(dune).author).toBe('Frank Herbert')
    expect(readFileSync(join(dir, 'Random/Idea.md'), 'utf8')).toBe('# Idea\n')
    expect(readFileSync(join(dir, 'Templates/Book.md'), 'utf8')).toBe(files['Templates/Book.md'])
    const { findings } = await inspectVault(dir)
    expect(findings.filter(f => f.rule === 'missing-field')).toEqual([])
    expect((await normaliseVault(dir, { ...options, write: true })).changed).toEqual([])
  })

  test('only limits the run to one folder', async () => {
    const dir = makeVault(files)
    const report = await normaliseVault(dir, { ...options, only: 'Contacts/' })
    expect(report.changed.map(c => c.path)).toEqual(['Contacts/Anna.md'])
  })

  test('files limits the run to exactly those notes, and ignores names that are not notes in the vault', async () => {
    const dir = makeVault(files)
    const report = await normaliseVault(dir, { ...options, files: ['Reading/Typed.md', 'Contacts/Anna.md', 'Gone/Deleted.md', 'Random/Idea.md'] })
    expect(report.changed.map(c => c.path).sort()).toEqual(['Contacts/Anna.md', 'Reading/Typed.md'])
    expect(report.notes).toBe(3)
  })

  test('files matches names whichever Unicode form git or the disk uses', async () => {
    const name = 'Reading/Ægir — Café.md'
    const dir = makeVault({ [name.normalize('NFD')]: '---\ntype: book\n---\n' })
    const report = await normaliseVault(dir, { today: TODAY, files: [name.normalize('NFC')] })
    expect(report.changed).toHaveLength(1)
  })

  test('an empty files list changes nothing (it does not mean "everything")', async () => {
    const dir = makeVault(files)
    expect((await normaliseVault(dir, { ...options, files: [] })).changed).toEqual([])
  })

  test('the CLI reads --files-from, one path per line', () => {
    const dir = makeVault({ 'A.md': '---\ntype: goal\n---\n', 'B.md': '---\ntype: goal\n---\n', 'list.txt': 'A.md\n\nnope.md\n' })
    const r = Bun.spawnSync(['bun', join(import.meta.dir, 'vault-normalise.ts'), dir, '--files-from', join(dir, 'list.txt'), '--json'], { stdout: 'pipe', stderr: 'pipe' })
    expect(r.exitCode).toBe(0)
    expect(JSON.parse(r.stdout.toString()).changed.map((c: { path: string }) => c.path)).toEqual(['A.md'])
  })

  test('takes created from the vault history when it is a git repo', async () => {
    const dir = makeVault({ 'Goals/Run.md': '---\ntype: goal\n---\n' })
    const git = (...args: string[]) => Bun.spawnSync(['git', '-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { env: { ...process.env, GIT_AUTHOR_DATE: '2025-03-04T10:00:00', GIT_COMMITTER_DATE: '2025-03-04T10:00:00' } })
    git('init', '-q')
    git('add', '.')
    git('commit', '-q', '-m', 'first')
    const report = await normaliseVault(dir, { today: TODAY, write: true })
    expect(report.changed).toHaveLength(1)
    expect(String(fm(readFileSync(join(dir, 'Goals/Run.md'), 'utf8')).created)).toContain('2025-03-04')
  })
})
