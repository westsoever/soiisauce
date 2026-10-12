import { describe, expect, test } from 'bun:test'
import { asText, readField } from './read-field'
import { note } from './life-test-utils'

describe('readField', () => {
  const n = note('People/Anna', { relationship: 'partner', title: 'Anna B' }, { title: 'Anna B', date: '2026-07-26' })

  test('reads NoteMeta keys', () => {
    expect(readField(n, 'title')).toBe('Anna B')
    expect(readField(n, 'date')).toBe('2026-07-26')
    expect(readField(n, 'folder')).toBe('People')
  })

  test('reads frontmatter keys', () => {
    expect(readField(n, 'relationship')).toBe('partner')
  })

  test('missing fields are undefined', () => {
    expect(readField(n, 'company')).toBeUndefined()
  })
})

describe('asText', () => {
  test.each([
    ['  Copenhagen ', 'Copenhagen'],
    ['   ', null],
    [42, '42'],
    [true, 'true'],
    [['partner', ' friend ', ''], 'partner, friend'],
    [[], null],
    [null, null],
    [undefined, null],
    [{ nested: 1 }, null]
  ])('asText(%p) → %p', (input, expected) => {
    expect(asText(input)).toBe(expected)
  })
})
