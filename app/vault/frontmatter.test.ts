// app/vault/frontmatter.test.ts
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '../lib/default-config'
import { compileVault } from './compile'
import { deriveFields, frontmatterTags, isHiddenYaml, normalizeValue, parseFrontmatter, splitFrontmatter, toDateString } from './frontmatter'

const types = DEFAULT_CONFIG.types

describe('parseFrontmatter', () => {
  test('splits YAML from the body', () => {
    const r = parseFrontmatter('---\ntype: person\ntags: [people]\n---\n\n## Who\nText')
    expect(r.error).toBeNull()
    expect(r.data).toEqual({ type: 'person', tags: ['people'] })
    expect(r.body).toBe('\n## Who\nText')
  })

  test('no frontmatter, empty frontmatter, BOM and CRLF', () => {
    expect(parseFrontmatter('# Hi').data).toEqual({})
    expect(parseFrontmatter('---\n---\nBody').body).toBe('Body')
    expect(parseFrontmatter('﻿---\r\ntitle: X\r\n---\r\nBody').data).toEqual({ title: 'X' })
  })

  test('malformed YAML keeps the note with empty frontmatter and an error', () => {
    const r = parseFrontmatter('---\ntitle: [unclosed\n---\nBody survives.')
    expect(r.data).toEqual({})
    expect(r.body).toBe('Body survives.')
    expect(r.error).toMatch(/^frontmatter is not valid YAML/)
  })

  test('duplicate keys are an error, not a crash', () => {
    expect(parseFrontmatter('---\na: 1\na: 2\n---\nx').error).toMatch(/^frontmatter is not valid YAML/)
  })

  test('YAML dates stay "YYYY-MM-DD" strings (YAML 1.2 core schema)', () => {
    expect(parseFrontmatter('---\ncreated: 2026-07-26\n---\n').data).toEqual({ created: '2026-07-26' })
  })

  test('unquoted [[link]] parses as a nested list and is kept', () => {
    expect(parseFrontmatter('---\ncover: [[cover.png]]\n---\n').data).toEqual({ cover: [['cover.png']] })
  })

  test('a scalar document is reported, not thrown', () => {
    expect(parseFrontmatter('---\njust text\n---\nBody').error).toBe('frontmatter is not a key/value map')
  })
})

describe('normalizeValue', () => {
  test('Dates become date strings, recursively', () => {
    expect(normalizeValue({ a: new Date('2026-07-26T00:00:00Z'), b: [new Date('2026-07-26T10:30:00Z')] })).toEqual({
      a: '2026-07-26',
      b: ['2026-07-26T10:30:00.000Z']
    })
  })
})

describe('derived fields', () => {
  test('toDateString takes the leading date or nothing', () => {
    expect(toDateString('2026-07-26 10:30')).toBe('2026-07-26')
    expect(toDateString('July')).toBeNull()
    expect(toDateString(20260726)).toBeNull()
  })

  test('tags from a list, a comma string, with # and case', () => {
    expect(frontmatterTags(['People', '#Relationship'])).toEqual(['people', 'relationship'])
    expect(frontmatterTags('a, b c')).toEqual(['a', 'b', 'c'])
    expect(frontmatterTags(undefined)).toEqual([])
  })

  test('type aliases, list-valued type, dates from fields or the file name, hidden', () => {
    expect(deriveFields({ type: 'Books' }, 'Books/Dune.md', types).type).toBe('book')
    expect(deriveFields({ type: ['film', 'x'] }, 'a.md', types).type).toBe('movie')
    expect(deriveFields({ type: 'recipe' }, 'a.md', types).type).toBe('recipe')
    expect(deriveFields({}, 'a.md', types).type).toBeNull()
    expect(deriveFields({ date: '2026-01-02', created: '2025-01-01' }, 'a.md', types).date).toBe('2026-01-02')
    expect(deriveFields({ created: '2025-01-01' }, 'a.md', types).date).toBe('2025-01-01')
    expect(deriveFields({}, '06-Wiki/daily_report/2026-10-06.md', types).date).toBe('2026-10-06')
    expect(deriveFields({ modified: '2026-02-02' }, 'a.md', types).updated).toBe('2026-02-02')
    expect(deriveFields({ soii: 'hidden' }, 'a.md', types).hidden).toBe(true)
    expect(deriveFields({ publish: false }, 'a.md', types).hidden).toBe(true)
    expect(deriveFields({ title: ' Dune ' }, 'a.md', types).title).toBe('Dune')
    expect(deriveFields({ title: 1984 }, 'a.md', types).title).toBe('1984')
  })
})

// Every form that hides a note, and the near-misses that must not.
const HIDDEN_LINES = [
  'soii: hidden',
  'soii: Hidden',
  'soii: HIDDEN',
  'soii: "hidden"',
  "soii: 'hidden'",
  'soii:   hidden   # keep private',
  'publish: false',
  'publish: False',
  'publish: FALSE',
  'publish: "false"',
  "publish: 'false'",
  'publish: "False"',
  'publish: no',
  'publish: "no"'
]
const VISIBLE_LINES = ['soii: visible', 'publish: true', 'publish: yes', 'publish: "true"', 'publish: nope', 'soii: hiddenish', 'type: hidden']

describe('hidden notes: valid and broken YAML agree', () => {
  test.each(HIDDEN_LINES)('%s hides the note when the YAML parses', line => {
    const { data, error } = parseFrontmatter(`---\n${line}\ntitle: Secret\n---\nbody\n`)
    expect(error).toBeNull()
    expect(deriveFields(data, 'a.md', types).hidden).toBe(true)
  })

  test.each(HIDDEN_LINES)('%s hides the note when the YAML is broken', line => {
    const { error, data } = parseFrontmatter(`---\n${line}\ntitle: [unclosed\n---\nbody\n`)
    expect(error).not.toBeNull()
    expect(data).toEqual({})
    expect(isHiddenYaml(splitFrontmatter(`---\n${line}\ntitle: [unclosed\n---\nbody\n`).yaml ?? '')).toBe(true)
  })

  test.each(VISIBLE_LINES)('%s does not hide the note on either path', line => {
    const { data } = parseFrontmatter(`---\n${line}\n---\nbody\n`)
    expect(deriveFields(data, 'a.md', types).hidden).toBe(false)
    expect(isHiddenYaml(`${line}\ntitle: [unclosed`)).toBe(false)
  })

  test('the two paths give the same answer for every form', () => {
    for (const line of [...HIDDEN_LINES, ...VISIBLE_LINES]) {
      const parsed = parseFrontmatter(`---\n${line}\n---\n`)
      expect(isHiddenYaml(line), line).toBe(deriveFields(parsed.data, 'a.md', types).hidden)
    }
  })

  test('CRLF files and nested or phrase-like text', () => {
    expect(isHiddenYaml('soii: hidden\r\ntitle: [unclosed')).toBe(true)
    expect(isHiddenYaml('title: [unclosed\r\npublish: false\r\n')).toBe(true)
    expect(isHiddenYaml('title: [unclosed')).toBe(false)
    expect(isHiddenYaml('notes: soii: hidden is a phrase')).toBe(false)
    expect(isHiddenYaml('meta:\n  publish: false\ntitle: [x')).toBe(false)
  })
})

describe('hidden notes never reach the compiled output', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]))

  test('every hidden form, with valid and with broken YAML, is skipped end to end', async () => {
    const vault = mkdtempSync(join(tmpdir(), 'soii-hidden-vault-'))
    const out = mkdtempSync(join(tmpdir(), 'soii-hidden-out-'))
    try {
      HIDDEN_LINES.forEach((line, i) => {
        writeFileSync(join(vault, `valid-${i}.md`), `---\n${line}\n---\nLEAK-VALID-${i}\n`)
        writeFileSync(join(vault, `broken-${i}.md`), `---\n${line}\nx: [y\n---\nLEAK-BROKEN-${i}\n`)
      })
      writeFileSync(join(vault, 'visible.md'), '---\ntitle: Visible\n---\nSHOWN\n')
      const { index } = await compileVault({ vaultDir: vault, outDir: out })
      expect(index.notes.map(n => n.id)).toEqual(['visible'])
      const everything = walk(out).map(file => readFileSync(file, 'utf8')).join('\n')
      expect(everything).not.toContain('LEAK-')
      expect(everything).toContain('SHOWN')
    } finally {
      rmSync(vault, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    }
  })
})
