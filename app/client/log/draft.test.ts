// app/client/log/draft.test.ts
import { describe, expect, test } from 'bun:test'
import { isWorthKeeping, parseDraft, type LogDraft } from './draft'

const base: LogDraft = { kind: 'book', title: '', values: {}, text: '', date: '2026-10-12' }

describe('parseDraft', () => {
  test('keeps a well-formed draft', () => {
    const d = { ...base, title: 'Dune', values: { status: 'reading' }, text: 'x' }
    expect(parseDraft(d)).toEqual(d)
  })

  test('drops junk instead of crashing', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('x')).toBeNull()
    expect(parseDraft({ kind: 'book' })).toBeNull()
    expect(parseDraft({ ...base, values: { a: 1, b: 'ok' } })).toEqual({ ...base, values: { b: 'ok' } })
  })

  test('an older draft keeps its text, and its title when it was a new note', () => {
    const old = { kind: 'book', values: {}, text: 'x', date: base.date, how: null }
    expect(parseDraft({ ...old, target: { mode: 'new', title: 'Dune' } })).toEqual({ ...base, title: 'Dune', text: 'x' })
    expect(parseDraft({ ...old, target: { mode: 'append', path: 'a.md', title: 'A' } })).toEqual({ ...base, text: 'x' })
  })
})

describe('isWorthKeeping', () => {
  test('defaults alone are not a draft; text, a title or a changed value is', () => {
    expect(isWorthKeeping({ ...base, values: { status: 'want' } }, { status: 'want' })).toBe(false)
    expect(isWorthKeeping({ ...base, title: ' ' }, {})).toBe(false)
    expect(isWorthKeeping({ ...base, text: 'hi' }, {})).toBe(true)
    expect(isWorthKeeping({ ...base, title: 'Dune' }, {})).toBe(true)
    expect(isWorthKeeping({ ...base, values: { status: 'reading' } }, { status: 'want' })).toBe(true)
  })
})
