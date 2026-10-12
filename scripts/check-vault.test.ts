import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checkVault, formatReport, inspectVault, suggestIsoDate, type Finding } from './check-vault'

const ENCODED = 'LS0tCmRhdGU6IDIwMjYtMDgtMTAKdGFnczogW2RhaWx5XQotLS0KCiMjIFBsYW4KCldyaXRlIHRoZSBwbGFuLgo='

function makeVault(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'soii-check-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return dir
}

const note = (fm: string, body = '# Note\n') => `---\n${fm}\n---\n\n${body}`
// The older tests are about other rules; missing-field has its own describe block below.
const forPath = (findings: Finding[], path: string) => findings.filter(f => f.path === path && f.rule !== 'missing-field')
const rules = (findings: Finding[], path: string) => forPath(findings, path).map(f => f.rule).sort()
const missingOf = (findings: Finding[], path: string) => findings.find(f => f.path === path && f.rule === 'missing-field')

describe('suggestIsoDate', () => {
  test('rewrites unambiguous dates to YYYY-MM-DD', () => {
    expect(suggestIsoDate('2026/3/1')).toBe('2026-03-01')
    expect(suggestIsoDate('2026-3-1')).toBe('2026-03-01')
    expect(suggestIsoDate('25.12.2026')).toBe('2026-12-25')
    expect(suggestIsoDate('March 1, 2026')).toBe('2026-03-01')
    expect(suggestIsoDate('1 Mar 2026')).toBe('2026-03-01')
  })
  test('gives up when day and month could swap, or when it is not a date', () => {
    expect(suggestIsoDate('03/04/2026')).toBeNull()
    expect(suggestIsoDate('soon')).toBeNull()
    expect(suggestIsoDate('2026-02-30')).toBeNull()
  })
})

describe('checkVault', () => {
  let dir = ''
  let findings: Finding[] = []
  let notes = 0
  beforeAll(async () => {
    dir = makeVault({
      'soii.config.yml': 'types:\n  recipe: [recipe, dish]\n',
      'Clean.md': note('type: book\nstatus: finished\nrating: 5\nfinished: 2026-03-01\nauthor: Frank Herbert', '# Dune\n\nSee [[Other]].\n'),
      'Other.md': '# Other\n',
      'Broken-yaml.md': '---\ntitle: Ægir: the saga: part 2\n  bad: [\n---\n\nBody\n',
      'List-yaml.md': '---\n- a\n- b\n---\n\nBody\n',
      'Encoded.md': ENCODED,
      'Types/Unknown.md': note('type: boook'),
      'Types/Alias.md': note('type: Books'),
      'Types/Config.md': note('type: dish'),
      'Types/Plain.md': note('type: meeting'),
      'Enums/Book.md': note('type: book\nstatus: Finished'),
      'Enums/BadBook.md': note('type: book\nstatus: done'),
      'Enums/Goal.md': note('type: goal\nstatus: active\nhorizon: decade'),
      'Enums/Sub.md': note('type: subscription\ncycle: monthly\nstatus: canceled'),
      'Enums/Person.md': note('type: person\ncircle: work\ncadence: every so often'),
      'Enums/PersonOk.md': note('type: person\ncircle: Friends\ncadence: 45\nbirthday: "--03-14"'),
      'Dates/Bad.md': note('type: book\nstarted: 2026/3/1\nfinished: "03/04/2026"\nwatched: true'),
      'Dates/Ok.md': note('type: person\nlast_contact: 2026-09-01\ncreated: 2026-09-01 14:22\nbirthday: "03-14"'),
      'Numbers/Bad.md': note('type: book\nrating: 7\nyear: soon'),
      'Numbers/Goal.md': note('type: goal\nprogress: 150'),
      'Numbers/Ok.md': note('type: subscription\nprice: "25,00 kr."\nstatus: active'),
      'Links/Many.md': `# Links\n\n${Array.from({ length: 15 }, (_, i) => `[[Missing ${i}]]`).join(' ')} [[Other]] [[Clean#Heading]] [[clean]]\n\n\`[[Not a link]]\`\n`,
      'Links/Typo.md': '# Typo\n\n[[Othr]]\n',
      'Hidden.md': note('soii: hidden\ntype: zzz', '[[Nowhere]]\n'),
      'Templates/Book.md': note('type: book\nstatus: {{status}}'),
      'Library/Books/A.md': note('type: book'),
      'Library/Books/B.md': note('type: book'),
      'Library/Books/C.md': note('type: book'),
      'Library/Books/Untyped.md': '# Untyped\n',
      'Mixed/A.md': note('type: book'),
      'Mixed/B.md': '# B\n',
      'Mixed/C.md': '# C\n'
    })
    ;({ findings, notes } = await inspectVault(dir))
  })
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('a clean note has no findings', () => {
    expect(forPath(findings, 'Clean.md')).toEqual([])
    expect(forPath(findings, 'Other.md')).toEqual([])
  })

  test('counts the notes it checked, skipping excluded and hidden ones', () => {
    expect(notes).toBe(29)
    expect(findings.some(f => f.path.startsWith('Templates/') || f.path === 'Hidden.md')).toBe(false)
  })

  test('frontmatter that is not YAML or not a map is an error', () => {
    const [bad] = forPath(findings, 'Broken-yaml.md')
    expect(bad).toMatchObject({ severity: 'error', rule: 'frontmatter-invalid' })
    expect(bad.message).toContain('line')
    expect(forPath(findings, 'List-yaml.md')[0]).toMatchObject({ severity: 'error', rule: 'frontmatter-invalid' })
  })

  test('a base64-encoded note is an error', () => {
    expect(forPath(findings, 'Encoded.md')).toEqual([expect.objectContaining({ severity: 'error', rule: 'base64-note' })])
  })

  test('unknown types warn, with a suggestion for near misses; aliases and config types are fine', () => {
    const [typo] = forPath(findings, 'Types/Unknown.md')
    expect(typo).toMatchObject({ severity: 'warning', rule: 'unknown-type' })
    expect(typo.fix).toContain('type: book')
    expect(forPath(findings, 'Types/Alias.md')).toEqual([])
    expect(forPath(findings, 'Types/Config.md')).toEqual([])
    expect(rules(findings, 'Types/Plain.md')).toEqual(['unknown-type'])
  })

  test('enum values outside the documented set warn; casing-only differences are info', () => {
    const [book] = forPath(findings, 'Enums/Book.md')
    expect(book).toMatchObject({ severity: 'info', rule: 'enum-case' })
    expect(book.fix).toContain('status: finished')
    const [bad] = forPath(findings, 'Enums/BadBook.md')
    expect(bad).toMatchObject({ severity: 'warning', rule: 'enum-value' })
    expect(bad.message).toContain('want, reading, finished, abandoned')
    expect(forPath(findings, 'Enums/Goal.md').map(f => f.message).join(' ')).toContain('horizon')
    expect(forPath(findings, 'Enums/Goal.md')).toHaveLength(1)
    expect(forPath(findings, 'Enums/Sub.md')).toEqual([expect.objectContaining({ rule: 'enum-value', field: 'status' })])
    expect(forPath(findings, 'Enums/Person.md').map(f => f.field).sort()).toEqual(['cadence', 'circle'])
    expect(forPath(findings, 'Enums/PersonOk.md').map(f => f.rule)).toEqual(['enum-case'])
  })

  test('date fields must be YYYY-MM-DD, with the ISO form suggested when unambiguous', () => {
    const bad = forPath(findings, 'Dates/Bad.md')
    expect(bad.every(f => f.rule === 'date-format' && f.severity === 'warning')).toBe(true)
    expect(bad.map(f => f.field).sort()).toEqual(['finished', 'started', 'watched'])
    expect(bad.find(f => f.field === 'started')?.fix).toBe('started: 2026-03-01')
    expect(bad.find(f => f.field === 'finished')?.fix).toBeUndefined()
    expect(forPath(findings, 'Dates/Ok.md')).toEqual([])
  })

  test('numeric fields must read as numbers, inside their range', () => {
    expect(forPath(findings, 'Numbers/Bad.md').map(f => `${f.rule}:${f.field}`).sort()).toEqual(['number-format:rating', 'number-format:year'])
    expect(forPath(findings, 'Numbers/Goal.md')).toEqual([expect.objectContaining({ rule: 'number-format', field: 'progress' })])
    expect(forPath(findings, 'Numbers/Ok.md')).toEqual([])
  })

  test('broken wikilinks are grouped per file and capped; code and resolvable links are ignored', () => {
    const [many] = forPath(findings, 'Links/Many.md')
    expect(many).toMatchObject({ severity: 'warning', rule: 'broken-link' })
    expect(many.message).toContain('15 broken links')
    expect(many.targets).toHaveLength(15)
    expect(many.message).toContain('+5 more')
    expect(many.message).not.toContain('Not a link')
    const [typo] = forPath(findings, 'Links/Typo.md')
    expect(typo.fix).toContain('[[Other]]')
  })

  test('an untyped note among same-typed siblings gets an info hint', () => {
    expect(forPath(findings, 'Library/Books/Untyped.md')).toEqual([
      expect.objectContaining({ severity: 'info', rule: 'missing-type', fix: 'type: book' })
    ])
    expect(forPath(findings, 'Mixed/B.md')).toEqual([])
  })

  test('findings are sorted by severity, then path', () => {
    const order = { error: 0, warning: 1, info: 2 }
    const keys = findings.map(f => `${order[f.severity]}\u0000${f.path}`)
    expect(keys).toEqual([...keys].sort())
  })

  test('checkVault returns just the findings', async () => {
    expect(await checkVault(dir)).toEqual(findings)
  })

  test('never modifies the vault', () => {
    expect(readFileSync(join(dir, 'Enums/Book.md'), 'utf8')).toBe(note('type: book\nstatus: Finished'))
  })

  test('the Markdown report has a summary and severity sections', () => {
    const report = formatReport({ findings, notes })
    expect(report).toMatch(/^29 notes checked: 3 errors, \d+ warnings, \d+ info/m)
    expect(report).toContain('## Errors')
    expect(report).toContain('### Encoded.md')
    expect(report.indexOf('## Errors')).toBeLessThan(report.indexOf('## Warnings'))
  })
})

describe('missing-field', () => {
  let dir = ''
  let findings: Finding[] = []
  beforeAll(async () => {
    const book = 'type: book\ntitle: Dune\nauthor: Frank Herbert\ncover:\nisbn:\nstatus: finished\nrating:\nstarted:\nfinished:\ncollection: []\ncategory: []'
    dir = makeVault({
      'Books/Partial.md': note('type: book\nauthor: Frank Herbert\nstatus: finished\nrating: 5'),
      'Books/Complete.md': note(book),
      'Books/Alias.md': note('type: Books'),
      'Audio/Narrated.md': note(`${book.replace('type: book', 'type: audiobook')}`),
      'People/Anna.md': note('type: person\nrelationship: friend'),
      'People/Full.md': note('type: person\nrelationship: friend\ncircle:\ncompany:\nrole:\nemail:\nphone:\nlocation:\nlinkedin:\nbirthday:\nlast_contact: 2026-09-01\ncadence:'),
      'Money/Sub.md': note('type: subscription\nprice: 9\ncurrency: EUR'),
      'Other/Project.md': note('type: project'),
      'Other/Plain.md': '# Plain\n',
      'Other/Broken.md': '---\ntype: book\n  bad: [\n---\n\nBody\n',
      'Other/Hidden.md': note('soii: hidden\ntype: book')
    })
    ;({ findings } = await inspectVault(dir))
  })
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('lists the documented fields a typed note lacks, as one info finding', () => {
    const f = missingOf(findings, 'Books/Partial.md')
    expect(f).toMatchObject({ severity: 'info', rule: 'missing-field' })
    expect(f?.fields).toEqual(['cover', 'isbn', 'started', 'finished', 'collection', 'category'])
    expect(f?.message).toContain('type: book')
    expect(f?.message).toContain('cover, isbn, started, finished, collection, category')
    expect(f?.fix).toContain('empty is fine')
  })

  test('an empty key counts as present; only an absent key is missing', () => {
    expect(missingOf(findings, 'Books/Complete.md')).toBeUndefined()
    expect(missingOf(findings, 'People/Full.md')).toBeUndefined()
  })

  test('title is never expected (soii takes it from the file name)', () => {
    expect(missingOf(findings, 'Books/Partial.md')?.fields).not.toContain('title')
  })

  test('aliases resolve to the canonical type; audiobooks also expect narrator', () => {
    expect(missingOf(findings, 'Books/Alias.md')?.message).toContain('type: book')
    expect(missingOf(findings, 'Audio/Narrated.md')?.fields).toEqual(['narrator'])
  })

  test('person and subscription fields come from the same table', () => {
    expect(missingOf(findings, 'People/Anna.md')?.fields).toEqual(['company', 'role', 'email', 'phone', 'location', 'last_contact', 'birthday', 'linkedin', 'cadence', 'circle'])
    expect(missingOf(findings, 'Money/Sub.md')?.fields).toEqual(['cycle', 'renews', 'status'])
  })

  test('the finding carries the canonical type', () => {
    expect(missingOf(findings, 'Books/Alias.md')?.type).toBe('book')
    expect(missingOf(findings, 'People/Anna.md')?.type).toBe('person')
  })

  test('the Markdown report summarises missing fields per type instead of listing every note', () => {
    const report = formatReport({ findings, notes: 11 })
    expect(report).toContain('## Missing properties')
    expect(report).toMatch(/\| book \| 2 \| /)
    expect(report).toMatch(/\| person \| 1 \| company \(1\)/)
    expect(report).not.toContain('### Books/Partial.md')
    expect(report).toMatch(/\d+ info\./) // still counted in the summary line
  })

  test('the summary reads right for one note and for several', () => {
    const one = formatReport({ findings: findings.filter(f => f.path === 'Books/Partial.md'), notes: 1 })
    expect(one).toContain('1 note lacks some of the properties')
    expect(formatReport({ findings, notes: 11 })).toMatch(/\d+ notes lack some of the properties/)
  })

  test('no finding for types without a field table, untyped, unreadable or hidden notes', () => {
    for (const p of ['Other/Project.md', 'Other/Plain.md', 'Other/Hidden.md']) expect(missingOf(findings, p)).toBeUndefined()
    expect(missingOf(findings, 'Other/Broken.md')).toBeUndefined()
  })
})

describe('config handling', () => {
  test('an invalid soii.config.yml is an error, and the defaults are used for the rest', async () => {
    const dir = makeVault({ 'soii.config.yml': 'types: [oops\n', 'A.md': note('type: book') })
    try {
      const findings = await checkVault(dir)
      expect(findings.filter(f => f.rule !== 'missing-field')).toEqual([expect.objectContaining({ path: 'soii.config.yml', severity: 'error', rule: 'config-invalid' })])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('types used in a config workspace query count as known', async () => {
    const dir = makeVault({
      'soii.config.yml': 'workspaces:\n  - id: kitchen\n    title: Kitchen\n    tabs:\n      - { id: all, title: All, view: list, query: { type: cocktail } }\n',
      'A.md': note('type: cocktail')
    })
    try {
      expect(await checkVault(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('CLI', () => {
  test('--json prints an array and exits 1 when there are errors', () => {
    const dir = makeVault({ 'Encoded.md': ENCODED, 'Ok.md': '# Ok\n' })
    try {
      const r = Bun.spawnSync(['bun', join(import.meta.dir, 'check-vault.ts'), dir, '--json'], { stdout: 'pipe', stderr: 'pipe' })
      expect(r.exitCode).toBe(1)
      const out = JSON.parse(r.stdout.toString())
      expect(Array.isArray(out)).toBe(true)
      expect(out[0]).toMatchObject({ path: 'Encoded.md', rule: 'base64-note' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('exits 0 on a clean vault and prints the summary', () => {
    const dir = makeVault({ 'Ok.md': '# Ok\n' })
    try {
      const r = Bun.spawnSync(['bun', join(import.meta.dir, 'check-vault.ts'), dir], { stdout: 'pipe', stderr: 'pipe' })
      expect(r.exitCode).toBe(0)
      expect(r.stdout.toString()).toContain('1 note checked: 0 errors, 0 warnings, 0 info')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
