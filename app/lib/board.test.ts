import { describe, expect, test } from 'bun:test'
import { boardFacets, boardSearch, filterBoard, groupNotes, linkValue, moveEdits, parseBoardSearch, progressOf, stampedDate, yearOf } from './board'
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

  test('a listed column is named as groups spells it, whatever the notes say', () => {
    const cols = groupNotes([note('g/a', { status: 'Active' })], { groupBy: 'status', groups: ['active'] })
    expect(labels(cols)).toEqual(['active'])
    expect(ids(cols, 'active')).toEqual(['g/a'])
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

describe('progressOf with progress_day (a daily goal)', () => {
  test('counts on its day, reads 0 on a later day, and is ignored when not a date', () => {
    const daily = (progress_day: unknown) => note('g/a', { progress: 80, progress_day })
    expect(progressOf(daily('2026-10-21'), '2026-10-21')).toBe(80)
    expect(progressOf(daily('2026-10-20'), '2026-10-21')).toBe(0)
    expect(progressOf(daily('2026-10-22'), '2026-10-21')).toBe(80)
    expect(progressOf(daily('someday'), '2026-10-21')).toBe(80)
    expect(progressOf(note('g/b', { progress: 'abc', progress_day: '2026-10-01' }), '2026-10-21')).toBeNull()
  })
})

describe('groupNotes with a fallback column', () => {
  const options = { groupBy: 'status', groups: ['backlog', 'doing', 'done', 'dropped'], fallback: 'backlog' }

  test('missing and unknown values land in the fallback column, so there is no "No status"', () => {
    const notes = [note('b/a', {}), note('b/b', { status: 'someday' }), note('b/c', { status: 'Doing' }), note('b/d', { status: '' })]
    const cols = groupNotes(notes, options)
    expect(labels(cols)).toEqual(['backlog', 'doing', 'done', 'dropped'])
    expect(ids(cols, 'backlog')).toEqual(['b/a', 'b/b', 'b/d'])
    expect(ids(cols, 'doing')).toEqual(['b/c'])
  })

  test('lists, numbers and booleans do not break it', () => {
    const notes = [note('b/a', { status: ['done', 'doing'] }), note('b/b', { status: 5 }), note('b/c', { status: true })]
    const cols = groupNotes(notes, options)
    expect(ids(cols, 'done')).toEqual(['b/a'])
    expect(ids(cols, 'backlog')).toEqual(['b/b', 'b/c'])
  })

  test('no notes still gives every column, empty', () => {
    expect(groupNotes([], options).map(c => c.notes.length)).toEqual([0, 0, 0, 0])
  })

  test('without groups, only missing values fall back', () => {
    const cols = groupNotes([note('b/a', {}), note('b/b', { status: 'later' })], { groupBy: 'status', fallback: 'backlog' })
    expect(labels(cols)).toEqual(['backlog', 'later'])
  })
})

describe('board filters', () => {
  const filters = [{ field: 'lane', none: 'Needs triage' }, { field: 'kind' }, { field: 'source' }]
  const notes = [
    note('b/a', { kind: 'job', source: 'todoist' }),
    note('b/b', { kind: 'task', lane: 'build', source: 'soii', blocked: 'waiting on the owner' }),
    note('b/c', { kind: 'Task', lane: 'research', source: 'todoist' }),
    note('b/d', { kind: 'task', lane: ' ', blocked: '' }),
    note('b/e', { kind: 'idea', lane: 'hold', blocked: 'login wall' })
  ]
  const ids = (list: typeof notes) => list.map(n => n.id)

  test('nothing chosen keeps every note', () => {
    expect(ids(filterBoard(notes, {}, false, 'blocked'))).toEqual(['b/a', 'b/b', 'b/c', 'b/d', 'b/e'])
  })

  test('a value matches case-insensitively, and fields combine with and', () => {
    expect(ids(filterBoard(notes, { kind: 'task' }, false))).toEqual(['b/b', 'b/c', 'b/d'])
    expect(ids(filterBoard(notes, { kind: 'task', source: 'todoist' }, false))).toEqual(['b/c'])
  })

  test('null means the field is empty: "needs triage" is no lane', () => {
    expect(ids(filterBoard(notes, { lane: null }, false))).toEqual(['b/a', 'b/d'])
  })

  test('the flag keeps notes whose flag field has text', () => {
    expect(ids(filterBoard(notes, {}, true, 'blocked'))).toEqual(['b/b', 'b/e'])
    expect(ids(filterBoard(notes, { lane: 'hold' }, true, 'blocked'))).toEqual(['b/e'])
  })

  test('facets list every value (first spelling wins, alphabetical), counted under the other filters', () => {
    const facets = boardFacets(notes, filters, { source: 'todoist' }, false, 'blocked')
    const kind = facets.filters.find(f => f.field === 'kind')!
    expect(kind.values).toEqual([
      { key: 'idea', label: 'idea', count: 0 },
      { key: 'job', label: 'job', count: 1 },
      { key: 'task', label: 'task', count: 1 }
    ])
    expect(kind.total).toBe(2)
    const source = facets.filters.find(f => f.field === 'source')!
    // Its own choice is ignored for its counts: every source still shows.
    expect(source.values.map(v => [v.key, v.count])).toEqual([['soii', 1], ['todoist', 2]])
    expect(source.noneCount).toBe(2)
    const lane = facets.filters.find(f => f.field === 'lane')!
    expect(lane.noneLabel).toBe('Needs triage')
    expect(lane.noneCount).toBe(1)
    expect(facets.flagCount).toBe(0)
    expect(boardFacets(notes, filters, {}, false, 'blocked').flagCount).toBe(2)
  })

  test('the URL round-trips, an empty value means "none", unknown keys are ignored', () => {
    const state = parseBoardSearch('?lane=&kind=task&other=x&blocked=1', filters, 'blocked')
    expect(state).toEqual({ values: { lane: null, kind: 'task' }, flag: true })
    expect(boardSearch(state, filters, 'blocked')).toBe('?lane=&kind=task&blocked=1')
    expect(boardSearch({ values: {}, flag: false }, filters, 'blocked')).toBe('')
    expect(parseBoardSearch('?blocked=1', filters)).toEqual({ values: {}, flag: false })
  })
})

describe('moveEdits', () => {
  const options = { groupBy: 'status', stamp: { done: 'done' } }

  test('moving writes the column label to the grouped field', () => {
    expect(moveEdits(note('b/a', { status: 'backlog' }), 'doing', options, '2026-10-20')).toEqual([{ key: 'status', value: 'doing' }])
  })

  test('moving into a stamped column also sets its date field to today', () => {
    expect(moveEdits(note('b/a', { status: 'doing' }), 'done', options, '2026-10-20')).toEqual([
      { key: 'status', value: 'done' },
      { key: 'done', value: '2026-10-20' }
    ])
  })

  test('moving out of it clears the date, if there is one', () => {
    expect(moveEdits(note('b/a', { status: 'done', done: '2026-10-01' }), 'doing', options, '2026-10-20')).toEqual([
      { key: 'status', value: 'doing' },
      { key: 'done', value: null }
    ])
    expect(moveEdits(note('b/a', { status: 'done' }), 'backlog', options, '2026-10-20')).toEqual([{ key: 'status', value: 'backlog' }])
  })

  test('the same column, case-insensitively, is no change', () => {
    expect(moveEdits(note('b/a', { status: 'Done' }), 'done', options, '2026-10-20')).toEqual([])
  })

  test('a note shown in the fallback column moves from there', () => {
    const fallback = { ...options, groups: ['backlog', 'doing', 'done'], fallback: 'backlog' }
    expect(moveEdits(note('b/a', { status: 'someday' }), 'doing', fallback, '2026-10-20')).toEqual([{ key: 'status', value: 'doing' }])
    expect(moveEdits(note('b/a', {}), 'done', fallback, '2026-10-20')).toEqual([
      { key: 'status', value: 'done' },
      { key: 'done', value: '2026-10-20' }
    ])
    expect(moveEdits(note('b/a', { status: 'someday' }), 'backlog', fallback, '2026-10-20')).toEqual([])
  })

  test('stampedDate shows the date only in its own column', () => {
    const n = note('b/a', { status: 'done', done: '2026-10-19' })
    expect(stampedDate(n, 'Done', options.stamp)).toBe('2026-10-19')
    expect(stampedDate(n, 'doing', options.stamp)).toBeNull()
    expect(stampedDate(note('b/b', { status: 'done' }), 'done', options.stamp)).toBeNull()
  })
})

describe('linkValue', () => {
  test('a URL is a link, labelled with a pull request or issue number when it has one', () => {
    expect(linkValue('https://github.com/you/repo/pull/42', 'PR')).toEqual({ kind: 'url', href: 'https://github.com/you/repo/pull/42', label: 'PR #42' })
    expect(linkValue('https://example.com/x', 'Issue')).toEqual({ kind: 'url', href: 'https://example.com/x', label: 'Issue' })
  })

  test('a wikilink is a note, with its alias if it has one', () => {
    expect(linkValue('[[Reading list]]', 'Result')).toEqual({ kind: 'note', target: 'Reading list', label: null })
    expect(linkValue('[[Notes/Result#Part|the write-up]]', 'Result')).toEqual({ kind: 'note', target: 'Notes/Result', label: 'the write-up' })
    // Unquoted `result: [[X]]` arrives from YAML as [["X"]].
    expect(linkValue([['X']], 'Result')).toEqual({ kind: 'note', target: 'X', label: null })
  })

  test('other text is shown as written; empty or odd values are nothing', () => {
    expect(linkValue('ABC-16', 'Issue')).toEqual({ kind: 'text', label: 'ABC-16' })
    expect(linkValue('javascript:alert(1)', 'PR')).toEqual({ kind: 'text', label: 'javascript:alert(1)' })
    expect(linkValue('', 'PR')).toBeNull()
    expect(linkValue(null, 'PR')).toBeNull()
    expect(linkValue({ a: 1 }, 'PR')).toBeNull()
  })
})
