import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { changelogSection, newChangelog, parseChangelog } from './changelog'

const v10 = `# Changelog

What's new in each soii release, newest first.

## v0.1.10

Finance shows one currency.

- A switch above Finance picks it.
`
const v11 = v10.replace('## v0.1.10', `## v0.1.11

Projects get a board.

### Small things

- Faster search.

## v0.1.10`)

test('parses the sections in file order, without the title or intro', () => {
  expect(parseChangelog(v11)).toEqual([
    { version: 'v0.1.11', body: 'Projects get a board.\n\n### Small things\n\n- Faster search.' },
    { version: 'v0.1.10', body: 'Finance shows one currency.\n\n- A switch above Finance picks it.' },
  ])
})

test('finds one section by tag or by bare version', () => {
  expect(changelogSection(v11, 'v0.1.10')?.body).toStartWith('Finance shows one currency.')
  expect(changelogSection(v11, '0.1.11')?.body).toStartWith('Projects get a board.')
  expect(changelogSection(v11, 'v0.1.12')).toBeNull()
})

test('newChangelog lists only the sections the old install did not have', () => {
  expect(newChangelog(v10, v11)).toEqual(['## v0.1.11\n\nProjects get a board.\n\n### Small things\n\n- Faster search.'])
  expect(newChangelog(v11, v11)).toEqual([])
})

test('an old install with no CHANGELOG.md gets every section, newest first, capped', () => {
  expect(newChangelog('', v11).map(s => s.split('\n')[0])).toEqual(['## v0.1.11', '## v0.1.10'])
  expect(newChangelog('', v11, 1)).toHaveLength(1)
})

test('never throws: empty, missing or junk text means nothing new', () => {
  expect(newChangelog('', '')).toEqual([])
  expect(newChangelog('junk', '## not a version\ntext')).toEqual([])
  expect(parseChangelog('\u0000\u0001')).toEqual([])
})

test('forgiving about hand-written files: CRLF and text after the version', () => {
  const crlf = '## v0.2.0 (2026-10-20)\r\n\r\nBig one.\r\n'
  expect(parseChangelog(crlf)).toEqual([{ version: 'v0.2.0', body: 'Big one.' }])
})

test("the repo's own CHANGELOG.md parses: every ## heading is a release", () => {
  const md = readFileSync(join(import.meta.dir, '..', '..', 'CHANGELOG.md'), 'utf8')
  const headings = md.split('\n').filter(l => l.startsWith('## '))
  expect(parseChangelog(md)).toHaveLength(headings.length)
  expect(md).not.toMatch(/\bD\d{2,3}\b/) // no decision numbers in public notes
})
