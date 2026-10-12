import { describe, expect, test } from 'bun:test'
import { DEFAULT_CONFIG } from './default-config'
import { runTab } from './query'
import type { NoteMeta, TabConfig } from './types'
import { applyPending, describeFilter, queryToRows, rowsToQuery } from './view-filter'

const note = (id: string, fm: Record<string, unknown>, extra: Partial<NoteMeta> = {}): NoteMeta =>
  ({ id, title: id, path: `${id}.md`, folder: '', type: (fm.type as string) ?? null, tags: [], date: null, updated: null, frontmatter: fm, excerpt: '', image: null, wordCount: 0, ...extra }) as NoteMeta

describe('rowsToQuery', () => {
  test('maps type, tag, folder and any other field', () => {
    expect(
      rowsToQuery([
        { field: 'type', values: ['book'] },
        { field: 'tag', values: ['#scifi', 'space'] },
        { field: 'folder', values: ['04-Resources/Library'] },
        { field: 'category', values: ['Biographies', 'History'] }
      ])
    ).toEqual({ type: 'book', tag: ['scifi', 'space'], path: '04-Resources/Library/**', where: { category: ['Biographies', 'History'] } })
  })
  test('no rows, or rows with no values, match every note', () => {
    expect(rowsToQuery([])).toEqual({})
    expect(rowsToQuery([{ field: 'status', values: ['  '] }])).toEqual({})
  })
  test('a folder typed with slashes around it becomes <folder>/**', () => {
    expect(rowsToQuery([{ field: 'folder', values: ['/People/'] }])).toEqual({ path: 'People/**' })
  })
  test('two rows on the same field merge into one (any of the values)', () => {
    expect(rowsToQuery([{ field: 'status', values: ['want'] }, { field: 'status', values: ['reading'] }])).toEqual({ where: { status: ['want', 'reading'] } })
  })
})

describe('queryToRows', () => {
  test('reads a single clause back into rows, in a fixed order', () => {
    expect(queryToRows({ where: { status: 'active' }, path: 'People/**', tag: 'friend', type: ['person', 'contact'] })).toEqual([
      { field: 'type', values: ['person', 'contact'] },
      { field: 'tag', values: ['friend'] },
      { field: 'folder', values: ['People'] },
      { field: 'status', values: ['active'] }
    ])
    expect(queryToRows([{ type: 'goal' }])).toEqual([{ field: 'type', values: ['goal'] }])
    expect(queryToRows({})).toEqual([])
  })
  test('null when the panel cannot show it faithfully', () => {
    expect(queryToRows([{ type: 'a' }, { type: 'b' }])).toBeNull()
    expect(queryToRows({ path: '01-Daily/20??-??-??.md' })).toBeNull()
    expect(queryToRows({ path: '**/Finance/**' })).toBeNull()
  })
  test('round trip keeps rows', () => {
    const rows = [
      { field: 'type', values: ['book'] },
      { field: 'category', values: ['History'] }
    ]
    expect(queryToRows(rowsToQuery(rows))).toEqual(rows)
  })
  test('a numeric where value still matches the same notes after a round trip', () => {
    const notes = [note('a', { type: 'book', rating: 5 }), note('b', { type: 'book', rating: 4 })]
    const index = { notes, config: DEFAULT_CONFIG }
    const before: TabConfig = { id: 't', title: 't', view: 'list', query: { type: 'book', where: { rating: 5 } } }
    const after: TabConfig = { ...before, query: rowsToQuery(queryToRows(before.query)!) }
    expect(runTab(after, index).map(n => n.id)).toEqual(runTab(before, index).map(n => n.id))
    expect(runTab(after, index).map(n => n.id)).toEqual(['a'])
  })
})

describe('describeFilter', () => {
  test('one plain line per clause, no backticks, later clauses start with "Or:"', () => {
    expect(describeFilter([{ type: 'daily-brief' }, { path: '**/daily_report/**' }])).toEqual(['Type is daily-brief', 'Or: in a path matching **/daily_report/**'])
  })
  test('values of one condition are "or", conditions in one clause are "and"', () => {
    expect(describeFilter({ type: ['person', 'contact'], tag: ['#friend', 'close'], path: '**/People/**', where: { status: ['active', 'done'], rating: 5 } })).toEqual([
      'Type is person or contact and tag is #friend or #close and in a path matching **/People/** and status is active or done and rating is 5'
    ])
  })
  test('a clause that starts with a property reads as a sentence', () => {
    expect(describeFilter({ where: { status: ['active', 'done'] } })).toEqual(['Status is active or done'])
    expect(describeFilter({ tag: 'x' })).toEqual(['Tag is #x'])
  })
  test('an empty query matches every note', () => {
    expect(describeFilter({})).toEqual(['Every note'])
    expect(describeFilter([{}, { type: 'a' }])).toEqual(['Every note', 'Or: type is a'])
  })
  test('never uses backticks', () => {
    expect(describeFilter([{ type: 'a', path: 'x/**' }, { tag: 'b' }]).join(' ')).not.toContain('`')
  })
})

describe('queryToRows: values the rows cannot hold faithfully', () => {
  test('a value with a comma is read-only (the value boxes split on commas)', () => {
    expect(queryToRows({ where: { author: 'Le Guin, Ursula' } })).toBeNull()
    expect(queryToRows({ where: { author: ['Adams', 'Le Guin, Ursula'] } })).toBeNull()
    expect(queryToRows({ type: 'a, b' })).toBeNull()
    expect(queryToRows({ tag: ['x', 'y, z'] })).toBeNull()
    expect(queryToRows({ path: 'People, Old/**' })).toBeNull()
  })
  test('a where key named like a row (type, tag, folder) is read-only', () => {
    expect(queryToRows({ where: { tag: 'x' } })).toBeNull()
    expect(queryToRows({ where: { folder: 'People' } })).toBeNull()
    expect(queryToRows({ where: { type: 'person' } })).toBeNull()
  })
  test('other keys still read back, including ones that merely contain those words', () => {
    expect(queryToRows({ where: { tags: 'x', folderName: 'y' } })).toEqual([
      { field: 'tags', values: ['x'] },
      { field: 'folderName', values: ['y'] }
    ])
  })
})

describe('applyPending', () => {
  const tab: TabConfig = { id: 't', title: 't', view: 'list', query: { type: 'book' }, sort: [{ field: 'title', dir: 'asc' }] }
  test('no pending changes: the tab as it is', () => {
    expect(applyPending(tab, {})).toEqual(tab)
  })
  test('a pending query or sort replaces the saved one', () => {
    const next = applyPending(tab, { query: { type: 'film' }, sort: [{ field: 'date', dir: 'desc' }] })
    expect(next.query).toEqual({ type: 'film' })
    expect(next.sort).toEqual([{ field: 'date', dir: 'desc' }])
  })
  test('an empty pending sort means the default order, as it does once saved (the key is removed)', () => {
    const next = applyPending(tab, { sort: [] })
    expect('sort' in next).toBe(false)
    const notes = [note('b', { type: 'book' }), note('a', { type: 'book' })]
    const index = { notes, config: DEFAULT_CONFIG }
    expect(runTab(next, index).map(n => n.id)).toEqual(runTab({ ...tab, sort: undefined }, index).map(n => n.id))
  })
  test('never writes an undefined key over the tab', () => {
    const next = applyPending(tab, { query: undefined, sort: undefined })
    expect(next.query).toEqual(tab.query)
    expect(next.sort).toEqual(tab.sort)
  })
})
