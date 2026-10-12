import { describe, expect, test } from 'bun:test'
import { groupNotes, progressOf, yearOf } from './board'
import { note } from './life-test-utils'

const labels = (cols: ReturnType<typeof groupNotes>) => cols.map(c => c.label)
const ids = (cols: ReturnType<typeof groupNotes>, label: string) => cols.find(c => c.label === label)!.notes.map(n => n.id)

describe('groupNotes by status', () => {
  test('known statuses follow the spec order', () => {
    const notes = [
      note('g/a', { status: 'done' }),
      note('g/b', { status: 'idea' }),
      note('g/c', { status: 'active' }),
      note('g/d', { status: 'reading' })
    ]
    expect(labels(groupNotes(notes, { groupBy: 'status' }))).toEqual(['idea', 'active', 'reading', 'done'])
  })

  test('unknown values come after known ones, alphabetically, case-insensitive', () => {
    const notes = [note('g/a', { status: 'someday' }), note('g/b', { status: 'Backlog' }), note('g/c', { status: 'active' })]
    expect(labels(groupNotes(notes, { groupBy: 'status' }))).toEqual(['active', 'Backlog', 'someday'])
  })

  test('missing values go last under "No <field>"', () => {
    const notes = [note('g/a', {}), note('g/b', { status: '  ' }), note('g/c', { status: 'idea' })]
    const cols = groupNotes(notes, { groupBy: 'status' })
    expect(labels(cols)).toEqual(['idea', 'No status'])
    expect(cols.at(-1)!.missing).toBe(true)
    expect(ids(cols, 'No status')).toEqual(['g/a', 'g/b'])
  })

  test('values that differ only in case share a column labelled by the first one seen', () => {
    const cols = groupNotes([note('g/a', { status: 'Active' }), note('g/b', { status: 'active' })], { groupBy: 'status' })
    expect(labels(cols)).toEqual(['Active'])
    expect(ids(cols, 'Active')).toEqual(['g/a', 'g/b'])
  })

  test('explicit groups set the order and keep empty columns; the rest follow alphabetically', () => {
    const notes = [note('g/a', { status: 'idea' }), note('g/b', { status: 'done' }), note('g/c', { status: 'zeta' }), note('g/d', {})]
    const cols = groupNotes(notes, { groupBy: 'status', groups: ['done', 'idea', 'later', 'Done'] })
    expect(labels(cols)).toEqual(['done', 'idea', 'later', 'zeta', 'No status'])
    expect(cols.find(c => c.label === 'later')!.notes).toEqual([])
  })

  test('list-valued fields group by their first element', () => {
    expect(labels(groupNotes([note('g/a', { status: ['active', 'x'] })], { groupBy: 'status' }))).toEqual(['active'])
  })

  test('keeps the incoming (engine-sorted) order inside a column', () => {
    const notes = [note('g/z', { status: 'idea' }), note('g/a', { status: 'idea' })]
    expect(ids(groupNotes(notes, { groupBy: 'status' }), 'idea')).toEqual(['g/z', 'g/a'])
  })

  test('no notes → no columns', () => {
    expect(groupNotes([], { groupBy: 'status' })).toEqual([])
  })
})

describe('groupNotes by year', () => {
  test('groups by year with fallbacks to due and date, ascending, "No year" last', () => {
    const notes = [
      note('g/num', { year: 2026 }),
      note('g/str', { year: '2027' }),
      note('g/due', { due: '2028-03-01' }),
      note('g/date', {}, { date: '2025-05-01' }),
      note('g/none', {})
    ]
    const cols = groupNotes(notes, { groupBy: 'year' })
    expect(labels(cols)).toEqual(['2025', '2026', '2027', '2028', 'No year'])
    expect(ids(cols, 'No year')).toEqual(['g/none'])
  })

  test('yearField overrides the field read first', () => {
    const cols = groupNotes([note('g/a', { target: 2030, year: 2026 })], { groupBy: 'year', yearField: 'target' })
    expect(labels(cols)).toEqual(['2030'])
  })

  test('yearOf ignores things that are not years', () => {
    expect(yearOf(note('g/a', { year: 'soon', due: 'tbd' }))).toBeNull()
    expect(yearOf(note('g/b', { year: 20261 }))).toBeNull()
    expect(yearOf(note('g/c', { year: '2026-10-06' }))).toBe('2026')
  })
})

describe('progressOf', () => {
  test.each([
    [40, 40],
    ['40%', 40],
    ['72', 72],
    [150, 100],
    [-5, 0],
    ['abc', null],
    [undefined, null]
  ])('progress %p → %p', (input, expected) => {
    expect(progressOf(note('g/a', { progress: input }))).toBe(expected)
  })
})
