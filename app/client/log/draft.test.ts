// app/client/log/draft.test.ts
import { describe, expect, test } from 'bun:test'
import { isWorthKeeping, parseDraft, type LogDraft } from './draft'

const base: LogDraft = { kind: 'book', target: null, values: {}, text: '', date: '2026-10-12', how: null }

describe('parseDraft', () => {
  test('keeps a well-formed draft', () => {
    const d = { ...base, target: { mode: 'append', path: 'a.md', title: 'A' }, values: { status: 'reading' }, text: 'x', how: 'met' }
    expect(parseDraft(d)).toEqual(d as LogDraft)
  })

  test('drops junk instead of crashing', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('x')).toBeNull()
    expect(parseDraft({ kind: 'book' })).toBeNull()
    expect(parseDraft({ ...base, values: { a: 1, b: 'ok' }, target: { mode: 'append', title: 'no path' } })).toEqual({ ...base, values: { b: 'ok' }, target: null })
  })
})

describe('isWorthKeeping', () => {
  test('defaults alone are not a draft; text, a target or a changed value is', () => {
    expect(isWorthKeeping({ ...base, values: { status: 'want' } }, { status: 'want' })).toBe(false)
    expect(isWorthKeeping({ ...base, target: { mode: 'new', title: ' ' } }, {})).toBe(false)
    expect(isWorthKeeping({ ...base, text: 'hi' }, {})).toBe(true)
    expect(isWorthKeeping({ ...base, target: { mode: 'append', path: 'a.md', title: 'A' } }, {})).toBe(true)
    expect(isWorthKeeping({ ...base, values: { status: 'reading' } }, { status: 'want' })).toBe(true)
  })
})
