// app/lib/log-edit.test.ts
import { describe, expect, test } from 'bun:test'
import { appendEntry, patchFrontmatter } from './log-edit'

const E = '- 2026-10-12 — hello'
const PERSON_TAIL = ['Identity / ambiguity flags', 'Sources']

describe('appendEntry', () => {
  test('goes at the end of an existing section, before the next heading', () => {
    const src = '---\ntype: person\n---\n\n# Anna\n\n## Notes & dated interactions\n- 2026-09-01 — coffee\n\n## Sources\n- x\n'
    expect(appendEntry(src, 'Notes & dated interactions', E)).toBe(
      '---\ntype: person\n---\n\n# Anna\n\n## Notes & dated interactions\n- 2026-09-01 — coffee\n- 2026-10-12 — hello\n\n## Sources\n- x\n'
    )
  })

  test('no trailing newline: the entry still gets its own line', () => {
    expect(appendEntry('# Dune\n\n## Log\n- 2026-01-01 — started', 'Log', E)).toBe('# Dune\n\n## Log\n- 2026-01-01 — started\n- 2026-10-12 — hello\n')
  })

  test('CRLF files stay CRLF', () => {
    expect(appendEntry('# A\r\n\r\n## Log\r\n- old\r\n', 'Log', E)).toBe('# A\r\n\r\n## Log\r\n- old\r\n- 2026-10-12 — hello\r\n')
  })

  test('a missing section is added at the end', () => {
    expect(appendEntry('# Dune\n\nGreat book.\n\n\n', 'Log', E)).toBe('# Dune\n\nGreat book.\n\n## Log\n\n- 2026-10-12 — hello\n')
  })

  test('an empty section directly followed by another heading', () => {
    expect(appendEntry('## Log\n## Next\n', 'Log', E)).toBe('## Log\n\n- 2026-10-12 — hello\n\n## Next\n')
  })

  test('the section name matches case-insensitively', () => {
    expect(appendEntry('## log\n- old\n', 'Log', E)).toBe('## log\n- old\n- 2026-10-12 — hello\n')
  })

  test('a missing people section goes before Sources, keeping the card order', () => {
    const src = '# Anna\n\n## Who they are\nFriend.\n\n## Sources\n- x\n'
    expect(appendEntry(src, 'Notes & dated interactions', E, { before: PERSON_TAIL })).toBe(
      '# Anna\n\n## Who they are\nFriend.\n\n## Notes & dated interactions\n\n- 2026-10-12 — hello\n\n## Sources\n- x\n'
    )
  })

  test('a heading inside a code fence is not the section', () => {
    expect(appendEntry('# How to\n\n```md\n## Log\n```\n', 'Log', E)).toBe('# How to\n\n```md\n## Log\n```\n\n## Log\n\n- 2026-10-12 — hello\n')
  })

  test('a typed heading inside an earlier entry does not capture the next one', () => {
    const first = appendEntry('# A\n', 'Log', '- 2026-10-11 — note\n  ## Log\n  ---')
    expect(appendEntry(first, 'Log', E)).toBe('# A\n\n## Log\n\n- 2026-10-11 — note\n  ## Log\n  ---\n- 2026-10-12 — hello\n')
  })

  test('a file that is only frontmatter', () => {
    expect(appendEntry('---\na: 1\n---', 'Log', E)).toBe('---\na: 1\n---\n## Log\n\n- 2026-10-12 — hello\n')
  })

  test('frontmatter lines are never read as headings', () => {
    expect(appendEntry('---\ntitle: "## Log"\n---\n# A\n', 'Log', E)).toBe('---\ntitle: "## Log"\n---\n# A\n\n## Log\n\n- 2026-10-12 — hello\n')
  })
})

describe('patchFrontmatter', () => {
  test('a list replaces the old value as a block list, the Library style', () => {
    const src = '---\ntype: book\ncategory:\n  - Biographies\ntags:\n  - StartupBooks\n---\n\n# T\n'
    expect(patchFrontmatter(src, { category: ['Leadership & Management'], collection: ['StartupBooks'] }).content).toBe(
      '---\ntype: book\ncategory:\n  - Leadership & Management\ntags:\n  - StartupBooks\ncollection:\n  - StartupBooks\n---\n\n# T\n'
    )
    // An empty `category:` (the imported template) and a plain string both become a list.
    expect(patchFrontmatter('---\ncategory:\n---\n', { category: ['Biographies'] }).content).toBe('---\ncategory:\n  - Biographies\n---\n')
    expect(patchFrontmatter('---\ncategory: Biographies\n---\n', { category: ['Biographies', 'Legal'] }).content).toBe('---\ncategory:\n  - Biographies\n  - Legal\n---\n')
  })

  test('changes only the given keys, keeping order, quotes, comments and flow lists', () => {
    const src = '---\ntype: book\nstatus: reading # since July\ncover: "[[dune.jpg]]"\nrating: 3\ntags: [a, b]\nupdated: 2026-09-01\n---\n\n# Dune\n'
    const r = patchFrontmatter(src, { status: 'finished', rating: 5, finished: '2026-10-12' }, { updated: '2026-10-12' })
    expect(r.warning).toBeNull()
    expect(r.content).toBe(
      '---\ntype: book\nstatus: finished # since July\ncover: "[[dune.jpg]]"\nrating: 5\ntags: [a, b]\nupdated: 2026-10-12\nfinished: 2026-10-12\n---\n\n# Dune\n'
    )
  })

  test('updated is only touched when the note already has it', () => {
    const r = patchFrontmatter('---\nstatus: idea\n---\n# G\n', { status: 'active' }, { updated: '2026-10-12' })
    expect(r.content).toBe('---\nstatus: active\n---\n# G\n')
  })

  test('a value that needs quotes gets them', () => {
    expect(patchFrontmatter('---\nstatus: "reading"\n---\n', { status: 'a: b' }).content).toBe('---\nstatus: "a: b"\n---\n')
  })

  test('no frontmatter yet: one is added', () => {
    expect(patchFrontmatter('# G\n', { status: 'done' }).content).toBe('---\nstatus: done\n---\n# G\n')
  })

  test('empty frontmatter gets the keys', () => {
    expect(patchFrontmatter('---\n---\n# G\n', { status: 'done' }).content).toBe('---\nstatus: done\n---\n# G\n')
  })

  test('unreadable YAML is left alone, with a warning', () => {
    const src = '---\na: [1, 2\n---\n# G\n'
    const r = patchFrontmatter(src, { status: 'done' })
    expect(r.content).toBe(src)
    expect(r.warning).toContain("Couldn't read")
  })

  test('CRLF stays CRLF', () => {
    expect(patchFrontmatter('---\r\nstatus: idea\r\n---\r\n# G\r\n', { status: 'done' }).content).toBe('---\r\nstatus: done\r\n---\r\n# G\r\n')
  })
})
