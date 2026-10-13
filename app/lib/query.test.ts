// app/lib/query.test.ts
import { describe, expect, test } from 'bun:test'
import { DEFAULT_CONFIG } from './default-config'
import { canonicalType, describeQuery, getField, matchesQuery, runTab, sortNotes } from './query'
import type { NoteMeta, TabConfig } from './types'

function note(id: string, extra: Partial<NoteMeta> = {}): NoteMeta {
  return {
    id, title: id.split('/').pop()!, path: `${id}.md`, folder: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '',
    type: null, tags: [], date: null, updated: null, frontmatter: {}, excerpt: '', image: null, wordCount: 0, ...extra
  }
}

const types = DEFAULT_CONFIG.types
const dune = note('Books/Dune', { type: 'book', tags: ['scifi'], date: '2026-03-01', frontmatter: { status: 'Finished', year: 1965, authors: ['Frank Herbert', 'X'] } })
const anna = note('People/Anna', { type: 'person', frontmatter: { relationship: 'partner' } })
const brief = note('06-Wiki/daily_report/2026-10-06', { date: '2026-10-06' })
const untyped = note('Inbox/thing', { tags: ['finance'] })

describe('query engine', () => {
  test('canonicalType maps aliases case-insensitively and passes unknown values through', () => {
    expect(canonicalType('Books', types)).toBe('book')
    expect(canonicalType(' film ', types)).toBe('movie')
    expect(canonicalType('recipe', types)).toBe('recipe')
  })

  test('canonicalType lowercases the canonical key, so it matches NoteMeta.type (spec §6.1)', () => {
    const mixed = { Book: ['Novel'], 'Daily-Brief': [] as string[] }
    expect(canonicalType('novel', mixed)).toBe('book')
    expect(canonicalType('BOOK', mixed)).toBe('book')
    expect(canonicalType('daily-brief', mixed)).toBe('daily-brief')
    expect(matchesQuery(dune, { type: 'novel' }, mixed)).toBe(true)
  })

  test('type clause accepts aliases in the query too', () => {
    expect(matchesQuery(dune, { type: 'books' }, types)).toBe(true)
    expect(matchesQuery(dune, { type: ['movie', 'book'] }, types)).toBe(true)
    expect(matchesQuery(anna, { type: 'book' }, types)).toBe(false)
    expect(matchesQuery(untyped, { type: 'book' }, types)).toBe(false)
  })

  test('path, tag and where clauses', () => {
    expect(matchesQuery(brief, { path: '**/daily_report/**' }, types)).toBe(true)
    expect(matchesQuery(untyped, { tag: '#Finance' }, types)).toBe(true)
    expect(matchesQuery(dune, { where: { status: 'finished' } }, types)).toBe(true)
    expect(matchesQuery(dune, { where: { status: ['reading', 'want'] } }, types)).toBe(false)
  })

  test('where compares numbers and numeric strings, and matches inside list values', () => {
    expect(matchesQuery(dune, { where: { year: '1965' } }, types)).toBe(true)
    expect(matchesQuery(dune, { where: { year: 1965 } }, types)).toBe(true)
    expect(matchesQuery(dune, { where: { authors: 'frank herbert' } }, types)).toBe(true)
  })

  test('where compares number-like and boolean-like values semantically', () => {
    const n = (frontmatter: Record<string, unknown>) => note('n', { frontmatter })
    expect(matchesQuery(n({ price: 9.9 }), { where: { price: '9.90' } }, types)).toBe(true)
    expect(matchesQuery(n({ price: '9.90' }), { where: { price: 9.9 } }, types)).toBe(true)
    expect(matchesQuery(n({ price: '9.90' }), { where: { price: '9.9' } }, types)).toBe(true)
    expect(matchesQuery(n({ rating: '5.0' }), { where: { rating: 5 } }, types)).toBe(true)
    expect(matchesQuery(n({ rating: 5 }), { where: { rating: '5.0' } }, types)).toBe(true)
    expect(matchesQuery(n({ rating: 5 }), { where: { rating: ['4', '5.0'] } }, types)).toBe(true)
    expect(matchesQuery(n({ price: 9.9 }), { where: { price: '9.91' } }, types)).toBe(false)
    expect(matchesQuery(n({ price: 'cheap' }), { where: { price: 0 } }, types)).toBe(false)
    expect(matchesQuery(n({ done: true }), { where: { done: 'true' } }, types)).toBe(true)
    expect(matchesQuery(n({ done: 'True' }), { where: { done: true } }, types)).toBe(true)
    expect(matchesQuery(n({ done: 'false' }), { where: { done: false } }, types)).toBe(true)
    expect(matchesQuery(n({ done: false }), { where: { done: 'true' } }, types)).toBe(false)
    expect(matchesQuery(n({ done: true }), { where: { done: 'yes' } }, types)).toBe(false)
  })

  test('where keeps strings case-insensitive and does not confuse types', () => {
    const n = (frontmatter: Record<string, unknown>) => note('n', { frontmatter })
    expect(matchesQuery(n({ status: ' Active ' }), { where: { status: 'active' } }, types)).toBe(true)
    expect(matchesQuery(n({ status: 'Active' }), { where: { status: 'inactive' } }, types)).toBe(false)
    expect(matchesQuery(n({ rating: true }), { where: { rating: 1 } }, types)).toBe(false)
    expect(matchesQuery(n({ rating: 1 }), { where: { rating: true } }, types)).toBe(false)
    expect(matchesQuery(n({}), { where: { rating: 0 } }, types)).toBe(false)
  })

  test('keys in a clause AND; clauses in a list OR; {} matches everything', () => {
    expect(matchesQuery(dune, { type: 'book', tag: 'nope' }, types)).toBe(false)
    expect(matchesQuery(brief, [{ type: 'daily-brief' }, { path: '**/daily_report/**' }], types)).toBe(true)
    expect(matchesQuery(anna, {}, types)).toBe(true)
  })

  test('sort puts missing values last in both directions, compares numbers numerically', () => {
    const a = note('a', { frontmatter: { n: 10 } })
    const b = note('b', { frontmatter: { n: 9 } })
    const c = note('c')
    expect(sortNotes([a, c, b], [{ field: 'n', dir: 'asc' }]).map(n => n.id)).toEqual(['b', 'a', 'c'])
    expect(sortNotes([a, c, b], [{ field: 'n', dir: 'desc' }]).map(n => n.id)).toEqual(['a', 'b', 'c'])
  })

  test('runTab filters, applies the default sort (date desc, then title) and limits', () => {
    const index = { notes: [untyped, dune, brief, anna], config: DEFAULT_CONFIG }
    const all: TabConfig = { id: 'all', title: 'All', view: 'list', query: {} }
    expect(runTab(all, index).map(n => n.id)).toEqual(['06-Wiki/daily_report/2026-10-06', 'Books/Dune', 'People/Anna', 'Inbox/thing'])
    expect(runTab({ ...all, limit: 1 }, index)).toHaveLength(1)
  })

  test('every default tab runs on an empty vault without throwing', () => {
    const index = { notes: [], config: DEFAULT_CONFIG }
    for (const ws of DEFAULT_CONFIG.workspaces) for (const tab of ws.tabs) expect(runTab(tab, index)).toEqual([])
  })

  test('describeQuery teaches the frontmatter convention', () => {
    expect(describeQuery({ type: 'book' })).toEqual(["Add `type: book` to a note's frontmatter."])
    expect(describeQuery([{ type: 'daily-brief' }, { path: '**/daily_report/**' }])).toEqual([
      "Add `type: daily-brief` to a note's frontmatter.",
      'Keep it in a path matching `**/daily_report/**`.'
    ])
    expect(describeQuery({ type: 'goal', where: { horizon: ['life', 'bucket'] } })).toEqual([
      "Add `type: goal` and `horizon: life` or `horizon: bucket` to a note's frontmatter."
    ])
    expect(describeQuery({ tag: 'finance' })).toEqual(['Tag it `#finance`.'])
    expect(describeQuery({})).toEqual(['Every note matches this tab.'])
  })
})

describe('fields named after Object.prototype members', () => {
  test('getField and where treat them as missing, but still read an own value', () => {
    const plain = note('p')
    for (const field of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(getField(plain, field)).toBeUndefined()
    expect(matchesQuery(plain, { where: { constructor: 'Object' } }, types)).toBe(false)
    const own = note('o', { frontmatter: { constructor: 'x', ['__proto__']: 'y' } })
    expect(getField(own, 'constructor')).toBe('x')
    expect(getField(own, '__proto__')).toBe('y')
    expect(matchesQuery(own, { where: { constructor: 'x' } }, types)).toBe(true)
  })

  test('sort puts notes without such a field last, in both directions', () => {
    const withIt = note('with', { frontmatter: { toString: 'a' } })
    const without = note('without')
    for (const dir of ['asc', 'desc'] as const) {
      expect(sortNotes([without, withIt], [{ field: 'toString', dir }]).map(n => n.id)).toEqual(['with', 'without'])
    }
  })

  test('the built-in 00 Inbox workspace lists everything under 00-Inbox, subfolders included, newest first', () => {
    const inbox = DEFAULT_CONFIG.workspaces.find(w => w.id === 'inbox')!
    expect(inbox.title).toBe('00 Inbox')
    expect(inbox.tabs).toHaveLength(1)
    const old = note('00-Inbox/old-idea', { date: '2026-10-01' })
    const clip = note('00-Inbox/clippings/Fresh clip', { date: '2026-10-12' })
    const mid = note('00-Inbox/mid', { date: '2026-10-05' })
    const elsewhere = note('01-Daily/2026-10-13', { date: '2026-10-13' })
    const lookalike = note('00-Inbox-archive/x', { date: '2026-10-13' })
    const index = { notes: [old, elsewhere, clip, lookalike, mid], config: DEFAULT_CONFIG }
    expect(runTab(inbox.tabs[0], index).map(n => n.id)).toEqual([clip.id, mid.id, old.id])
  })
})
