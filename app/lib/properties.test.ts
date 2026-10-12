// app/lib/properties.test.ts
import { describe, expect, test } from 'bun:test'
import { cleanPropertyValue, draftFor, editorFor, isEditableKey, MAX_PROPERTY_VALUE, suggestKeys, valueFromDraft } from './properties'
import type { NoteMeta } from './types'

describe('isEditableKey', () => {
  test('accepts ordinary property names, including spaces and dashes', () => {
    for (const key of ['relationship', 'last_contact', 'Due date', 'og-image', 'v2', 'Ärger']) expect(isEditableKey(key)).toBe(true)
  })

  test('refuses protected, odd and dangerous keys', () => {
    for (const key of ['title', 'tags', 'soii', 'publish', 'aliases', 'cssclasses', 'Tags', '__proto__', 'constructor', 'prototype', '', ' x', 'x ', 'a:b', '#x', '-x', 'x\ny', 'x'.repeat(65), 7, null]) {
      expect(isEditableKey(key)).toBe(false)
    }
  })
})

describe('editorFor', () => {
  test('picks an editor from the current value', () => {
    expect(editorFor('friend')).toBe('text')
    expect(editorFor('2026-10-12')).toBe('date')
    expect(editorFor(5)).toBe('number')
    expect(editorFor(true)).toBe('boolean')
    expect(editorFor(['a', 2])).toBe('list')
    expect(editorFor([])).toBe('list')
    expect(editorFor(null)).toBe('text')
    expect(editorFor(undefined)).toBe('text')
  })

  test('an empty value takes its editor from the name', () => {
    expect(editorFor(null, 'started')).toBe('date')
    expect(editorFor(null, 'birthday')).toBe('date')
    expect(editorFor('', 'published')).toBe('date')
    expect(editorFor(null, 'rating')).toBe('number')
    expect(editorFor(null, 'author')).toBe('text')
    expect(editorFor('loved it', 'rating')).toBe('text')
    expect(draftFor(null, undefined, 'finished')).toMatchObject({ editor: 'date', text: '' })
  })

  test('nested lists and objects stay read-only', () => {
    expect(editorFor([['Erica']])).toBe(null)
    expect(editorFor({ a: 1 })).toBe(null)
    expect(editorFor([{ a: 1 }])).toBe(null)
  })
})

describe('cleanPropertyValue', () => {
  test('collapses whitespace in text, and empty text clears the value', () => {
    expect(cleanPropertyValue('  close \n friend ')).toEqual({ ok: true, value: 'close friend' })
    expect(cleanPropertyValue('   ')).toEqual({ ok: true, value: null })
    expect(cleanPropertyValue(null)).toEqual({ ok: true, value: null })
  })

  test('keeps numbers and booleans as they are', () => {
    expect(cleanPropertyValue(4.5)).toEqual({ ok: true, value: 4.5 })
    expect(cleanPropertyValue(false)).toEqual({ ok: true, value: false })
  })

  test('cleans list items and drops empty ones; an empty list clears the value', () => {
    expect(cleanPropertyValue([' a ', '', 'b  c', 3])).toEqual({ ok: true, value: ['a', 'b c', 3] })
    expect(cleanPropertyValue(['  '])).toEqual({ ok: true, value: null })
  })

  test('refuses what a property can not hold', () => {
    const bad = [undefined, Number.NaN, Number.POSITIVE_INFINITY, { a: 1 }, [['x']], [{}], [true], 'x'.repeat(MAX_PROPERTY_VALUE + 1), Array(101).fill('x'), ['x'.repeat(201)]]
    for (const v of bad) expect(cleanPropertyValue(v).ok).toBe(false)
  })
})

describe('draftFor and valueFromDraft', () => {
  test('round-trip each editor', () => {
    expect(draftFor('friend')).toEqual({ editor: 'text', text: 'friend', items: [], checked: false })
    expect(draftFor(4.5)).toMatchObject({ editor: 'number', text: '4.5' })
    expect(draftFor(true)).toMatchObject({ editor: 'boolean', checked: true })
    expect(draftFor(['a', 2])).toMatchObject({ editor: 'list', items: ['a', '2'], text: '' })
    expect(draftFor(null)).toMatchObject({ editor: 'text', text: '' })
    expect(draftFor({ a: 1 })).toBe(null)
  })

  test('turns a draft back into a value', () => {
    expect(valueFromDraft({ editor: 'text', text: ' hi ', items: [], checked: false })).toEqual({ ok: true, value: 'hi' })
    expect(valueFromDraft({ editor: 'text', text: '  ', items: [], checked: false })).toEqual({ ok: true, value: null })
    expect(valueFromDraft({ editor: 'date', text: '2026-10-12', items: [], checked: false })).toEqual({ ok: true, value: '2026-10-12' })
    expect(valueFromDraft({ editor: 'date', text: '12/10/2026', items: [], checked: false }).ok).toBe(false)
    expect(valueFromDraft({ editor: 'number', text: '4,5', items: [], checked: false })).toEqual({ ok: true, value: 4.5 })
    expect(valueFromDraft({ editor: 'number', text: '', items: [], checked: false })).toEqual({ ok: true, value: null })
    expect(valueFromDraft({ editor: 'number', text: 'lots', items: [], checked: false }).ok).toBe(false)
    expect(valueFromDraft({ editor: 'boolean', text: '', items: [], checked: true })).toEqual({ ok: true, value: true })
  })

  test('a list keeps its items and takes what is still typed in the box', () => {
    expect(valueFromDraft({ editor: 'list', text: ' c ', items: ['a', 'b'], checked: false })).toEqual({ ok: true, value: ['a', 'b', 'c'] })
    expect(valueFromDraft({ editor: 'list', text: '', items: [], checked: false })).toEqual({ ok: true, value: null })
  })
})

describe('suggestKeys', () => {
  const n = (path: string, type: string | null, frontmatter: Record<string, unknown>) => ({ path, type, frontmatter }) as NoteMeta
  test('offers the keys other notes of the same type use, most common first, minus the note\'s own and protected ones', () => {
    const me = n('P/Marvin.md', 'person', { type: 'person', relationship: 'friend' })
    const notes = [
      me,
      n('P/Anna.md', 'person', { type: 'person', birthday: '1990-01-01', company: 'A', tags: ['x'] }),
      n('P/Bob.md', 'person', { type: 'person', company: 'B', relationship: 'x' }),
      n('B/Dune.md', 'book', { type: 'book', author: 'Herbert' })
    ]
    expect(suggestKeys(me, notes)).toEqual(['company', 'birthday'])
  })
})
