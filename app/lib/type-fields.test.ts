import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TYPE_FIELDS, expectedFields } from './type-fields'

// docs/frontmatter.md "Fields per type" is the reference people read; the checker's
// missing-field rule and /soii-setup use TYPE_FIELDS. They must not drift apart.
const DOC = readFileSync(join(import.meta.dir, '..', '..', 'docs', 'frontmatter.md'), 'utf8')

/** Field names in a "Fields per type" cell: the backticked spans, parentheticals dropped. */
function docFields(cell: string): string[] {
  const spans = [...cell.matchAll(/`([^`]+)`/g)].map(m => m[1].replace(/\([^)]*\)/g, ''))
  return spans.flatMap(span => span.split(',').map(t => t.trim()).filter(t => /^[a-z_]+$/.test(t)))
}

function docRows(): [string[], string[]][] {
  const section = DOC.slice(DOC.indexOf('## Fields per type'), DOC.indexOf('Example:'))
  return section
    .split('\n')
    .filter(l => l.startsWith('| ') && !l.startsWith('| Type') && !l.startsWith('|---'))
    .map(l => {
      const [, types, fields] = l.split('|')
      return [types.split(',').map(t => t.trim()), docFields(fields)]
    })
}

describe('TYPE_FIELDS', () => {
  test('matches the "Fields per type" table in docs/frontmatter.md, minus title', () => {
    const rows = docRows().filter(([types]) => types.some(t => t in TYPE_FIELDS))
    expect(rows.length).toBeGreaterThanOrEqual(8)
    for (const [types, fields] of rows) {
      const wanted = new Set(fields.filter(f => f !== 'title'))
      const have = new Set(types.flatMap(t => TYPE_FIELDS[t] ?? []))
      expect([...have].sort()).toEqual([...wanted].sort())
    }
  })

  test('every type in the doc table with fields is covered, except the date-only ones', () => {
    const covered = new Set(Object.keys(TYPE_FIELDS))
    const missing = docRows().flatMap(([types, fields]) => (fields.filter(f => f !== 'title' && f !== 'date').length ? types.filter(t => !covered.has(t)) : []))
    expect(missing).toEqual([])
  })

  test('title is never in the list, and expectedFields is a lookup with an empty default', () => {
    for (const fields of Object.values(TYPE_FIELDS)) expect(fields).not.toContain('title')
    expect(expectedFields('book')).toEqual(TYPE_FIELDS.book)
    expect(expectedFields('project')).toEqual([])
  })
})
