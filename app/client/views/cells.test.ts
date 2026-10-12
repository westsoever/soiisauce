// app/client/views/cells.test.ts
import { describe, expect, test } from 'bun:test'
import { displayValue, hasValue, labelFor, toColumn } from './cells'

describe('cells', () => {
  test('labelFor humanises field names', () => {
    expect(labelFor('last_contact')).toBe('Last contact')
    expect(labelFor('title')).toBe('Title')
    expect(labelFor('lastSeen')).toBe('Last seen')
  })
  test('toColumn guesses formats from well-known fields', () => {
    expect(toColumn('renews')).toEqual({ field: 'renews', label: 'Renews', format: 'date' })
    expect(toColumn('tags').format).toBe('tags')
    expect(toColumn('rating').format).toBe('rating')
    expect(toColumn('url').format).toBe('link')
    expect(toColumn('linkedin').format).toBe('link')
    expect(toColumn('lastSeen')).toEqual({ field: 'lastSeen', label: 'Last seen', format: 'date' })
    expect(toColumn('company').format).toBe('text')
    expect(toColumn({ field: 'price', format: 'currency' })).toEqual({ field: 'price', label: 'Price', format: 'currency' })
    expect(toColumn({ field: 'price', label: 'Cost' }).label).toBe('Cost')
  })
  test('displayValue flattens lists and wikilink lists', () => {
    expect(displayValue(['a', 'b'])).toBe('a, b')
    expect(displayValue([['Erica']])).toBe('Erica')
    expect(displayValue(true)).toBe('Yes')
    expect(displayValue({ a: 1 })).toBe('{"a":1}')
  })
})

test('hasValue: empty strings, nulls and empty lists are empty', () => {
  const n = {
    id: 'a', title: 'A', path: 'a.md', folder: '', type: null, tags: [], date: null, updated: null,
    frontmatter: { company: '', role: 'CTO', list: [], zero: 0 }, excerpt: '', image: null, wordCount: 1
  }
  expect(hasValue(n, toColumn('company'))).toBe(false)
  expect(hasValue(n, toColumn('missing'))).toBe(false)
  expect(hasValue(n, toColumn('list'))).toBe(false)
  expect(hasValue(n, toColumn('role'))).toBe(true)
  expect(hasValue(n, toColumn('zero'))).toBe(true)
})
