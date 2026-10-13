import { describe, expect, test } from 'bun:test'
import { note } from '../../../lib/life-test-utils'
import type { NoteMeta } from '../../../lib/types'
import {
  browse,
  browseSearch,
  columnsAt,
  EMPTY_BROWSE,
  gridClasses,
  GRID_COLUMNS,
  hasMyNotes,
  NO_COLLECTION,
  normalizeStatus,
  parseBrowse,
  parseLayout,
  shelf,
  showAll,
  type BrowseState
} from './browse'

const ROOT = '04-Resources/Library/Books'
const b = (name: string, fm: Record<string, unknown>, extra: Partial<NoteMeta> = {}) => note(`${ROOT}/${name}`, { type: 'book', ...fm }, extra)
const SB = { tags: ['ReadingList'] }
const NOTES = [
  b('ReadingList/Steve Jobs', { category: ['Biographies'], status: 'finished' }, { ...SB, noteWords: 120 }),
  b('ReadingList/Elon', { category: ['biographies '], status: 'want' }, SB),
  b('ReadingList/Lean Startup', { category: 'Startup Methodologies', status: 'reading' }, { ...SB, noteWords: 4 }),
  b('ReadingList/Mystery', { status: 'Done' }, { ...SB, noteWords: 0 }),
  b('Psychology of Money', { status: 'finished' }, { noteWords: 300 })
]
const run = (state: Partial<BrowseState>) => browse(NOTES, { ...EMPTY_BROWSE, ...state }, 'book')
const shape = (r: ReturnType<typeof run>) => r.groups.map(g => [g.label, g.notes.map(n => n.title)])

describe('normalizeStatus', () => {
  test('want, reading, read and their synonyms; anything else is none', () => {
    for (const s of ['want', 'to-read', 'To Read', 'watchlist']) expect(normalizeStatus(s)).toBe('want')
    for (const s of ['reading', 'watching']) expect(normalizeStatus(s)).toBe('reading')
    for (const s of ['finished', 'read', 'Done', 'watched']) expect(normalizeStatus(s)).toBe('read')
    for (const s of ['abandoned', '', 3, null, 'constructor']) expect(normalizeStatus(s)).toBeNull()
  })
})

test('hasMyNotes is any word outside headings; a missing count is 0', () => {
  expect(NOTES.map(hasMyNotes)).toEqual([true, false, true, false, true])
})

describe('browse', () => {
  test('sections count the whole tab, No collection last; All/All groups by collection', () => {
    const r = run({})
    expect(r.sections).toEqual([
      { key: 'readinglist', value: 'ReadingList', label: 'Reading List', count: 4 },
      { key: NO_COLLECTION, value: '', label: 'No collection', count: 1 }
    ])
    expect(r.total).toBe(5)
    expect(r.grouped).toBe(true)
    expect(r.groupedBy).toBe('collection')
    expect(shape(r)).toEqual([
      ['Reading List', ['Steve Jobs', 'Elon', 'Lean Startup', 'Mystery']],
      ['No collection', ['Psychology of Money']]
    ])
  })

  test('a section groups by category, count desc, Uncategorized last', () => {
    const r = run({ c: 'readinglist' })
    expect(r.section).toBe('readinglist')
    expect(r.matching).toBe(4)
    expect(r.groupedBy).toBe('category')
    expect(r.subcategories.map(f => [f.label, f.count])).toEqual([['Biographies', 2], ['Startup Methodologies', 1], ['Uncategorized', 1]])
    expect(shape(r).map(([label]) => label)).toEqual(['Biographies', 'Startup Methodologies', 'Uncategorized'])
  })

  test('No collection is a section of its own', () => {
    const r = run({ c: NO_COLLECTION })
    expect(r.section).toBe(NO_COLLECTION)
    expect(r.groups.flatMap(g => g.notes.map(n => n.title))).toEqual(['Psychology of Money'])
    expect(r.grouped).toBe(false)
    expect(parseBrowse('?c=No+collection').c).toBe(NO_COLLECTION)
  })

  test('subcategory counts follow the status filter; section counts do not', () => {
    const r = run({ c: 'readinglist', s: ['read'] })
    expect(r.sections[0].count).toBe(4)
    expect(r.matching).toBe(2)
    expect(r.subcategories.map(f => [f.label, f.count])).toEqual([['Biographies', 1], ['Uncategorized', 1]])
  })

  test('status chips: counted in the section before the status filter; which ones show depends only on the section', () => {
    expect(run({ c: 'readinglist' }).statuses).toEqual([
      { id: 'want', label: 'Want', count: 1 },
      { id: 'reading', label: 'Reading', count: 1 },
      { id: 'read', label: 'Read', count: 2 }
    ])
    // Has my notes leaves Want at 0 but keeps the chip, so the toolbar doesn't move.
    expect(run({ c: 'readinglist', notes: true }).statuses.map(s => [s.id, s.count])).toEqual([['want', 0], ['reading', 1], ['read', 1]])
    expect(run({ c: 'no collection' }).statuses.map(s => s.id)).toEqual(['read'])
    expect(run({ c: 'no collection', s: ['want'] }).statuses.map(s => s.id)).toEqual(['want', 'read'])
  })

  test('search matches every word in the title, author or aliases, and narrows the counts', () => {
    const notes = [b('Steve Jobs', { author: 'Walter Isaacson', status: 'read' }), b('Elon Musk', { author: 'Walter Isaacson', aliases: ['Musk bio'] }), b('Shoe Dog', { author: 'Phil Knight' })]
    const titles = (q: string) => browse(notes, { ...EMPTY_BROWSE, q }, 'book').groups.flatMap(g => g.notes.map(n => n.title))
    expect(titles('isaacson')).toEqual(['Steve Jobs', 'Elon Musk'])
    expect(titles('walter elon')).toEqual(['Elon Musk'])
    expect(titles('musk BIO')).toEqual(['Elon Musk'])
    expect(titles('  ')).toHaveLength(3)
    expect(titles('nothing')).toEqual([])
    expect(browse(notes, { ...EMPTY_BROWSE, q: 'shoe' }, 'book').statuses).toEqual([{ id: 'read', label: 'Read', count: 0 }])
  })

  test('films say Watchlist / Watching / Watched', () => {
    const heat = note('04-Resources/Library/Movies/Heat', { type: 'movie', status: 'watched' })
    expect(browse([heat], EMPTY_BROWSE, 'movie').statuses).toEqual([{ id: 'read', label: 'Watched', count: 1 }])
  })

  test('Has my notes keeps notes with any words of their own', () => {
    expect(run({ c: 'readinglist', notes: true }).groups.flatMap(g => g.notes.map(n => n.title))).toEqual(['Steve Jobs', 'Lean Startup'])
  })

  test('a subcategory is flat', () => {
    const r = run({ c: 'readinglist', cat: 'uncategorized' })
    expect(r.category).toBe('uncategorized')
    expect(r.grouped).toBe(false)
    expect(r.groupedBy).toBeNull()
    expect(shape(r)).toEqual([['', ['Mystery']]])
  })

  test('unknown values are ignored', () => {
    const r = run({ c: 'nope', cat: 'nope' })
    expect(r.section).toBeNull()
    expect(r.category).toBeNull()
    expect(shape(r)).toEqual(shape(run({})))
  })

  test('nothing matches: no groups, the facets stay', () => {
    const r = run({ c: 'readinglist', s: ['want'], notes: true })
    expect(r.groups).toEqual([])
    expect(r.sections.length).toBe(2)
    expect(r.matching).toBe(0)
  })

  test('a tab without collections groups by category and has no Sections row', () => {
    const r = browse([NOTES[0], NOTES[4]].map(n => ({ ...n, tags: [], folder: ROOT })), EMPTY_BROWSE, 'book')
    expect(r.sections).toEqual([])
    expect(r.groupedBy).toBe('category')
    expect(shape(r).map(([label]) => label)).toEqual(['Biographies', 'Uncategorized'])
  })

  test('a category named Uncategorized joins the bucket', () => {
    const r = browse([b('A', { category: 'Uncategorized' }), b('B', {})], EMPTY_BROWSE, 'book')
    expect(r.subcategories.map(f => [f.key, f.count])).toEqual([['uncategorized', 2]])
  })
})

describe('shelves', () => {
  const many = Array.from({ length: 12 }, (_, i) => b(`ReadingList/B${i}`, { category: 'Biographies' }, SB))
  const r = browse([...many, NOTES[2]], { ...EMPTY_BROWSE, c: 'readinglist' }, 'book')

  test('a grouped view caps each group and counts what is hidden', () => {
    const bio = r.groups[0]
    expect(bio.notes).toHaveLength(12)
    expect(shelf(bio, r.grouped, { view: 'grid', size: 'l' }).notes).toHaveLength(10)
    expect(shelf(bio, r.grouped, { view: 'grid', size: 'l' }).hidden).toBe(2)
    expect(shelf(bio, r.grouped, { view: 'grid', size: 'm' }).hidden).toBe(0)
    expect(shelf(bio, r.grouped, { view: 'list', size: 'l' }).hidden).toBe(8)
    expect(shelf(bio, false, { view: 'list', size: 'l' }).hidden).toBe(0)
  })

  test('Show all selects the group and keeps the other filters', () => {
    expect(showAll({ ...EMPTY_BROWSE, c: 'readinglist', s: ['read'] }, r, r.groups[0])).toEqual({ c: 'readinglist', cat: 'biographies', s: ['read'], notes: false, q: '' })
    const all = run({})
    expect(showAll(EMPTY_BROWSE, all, all.groups[0])).toEqual({ ...EMPTY_BROWSE, c: 'readinglist' })
    expect(showAll(EMPTY_BROWSE, all, all.groups[1])).toEqual({ ...EMPTY_BROWSE, c: NO_COLLECTION })
  })
})

describe('URL state', () => {
  test('parses keys folded, statuses in canonical order, unknowns dropped', () => {
    expect(parseBrowse('?c=ReadingList&cat=Biographies&s=read,bogus,WANT&notes=1')).toEqual({ c: 'readinglist', cat: 'biographies', s: ['want', 'read'], notes: true, q: '' })
    expect(parseBrowse('?q=shoe+dog')).toEqual({ ...EMPTY_BROWSE, q: 'shoe dog' })
    expect(parseBrowse('')).toEqual(EMPTY_BROWSE)
    expect(parseBrowse('?c=&s=&notes=yes')).toEqual(EMPTY_BROWSE)
  })
  test('serialises only what is set, and round-trips', () => {
    const state: BrowseState = { c: 'readinglist', cat: 'leadership & management', s: ['read', 'want'], notes: true, q: 'shoe dog' }
    expect(browseSearch(state)).toBe('?c=readinglist&cat=leadership+%26+management&s=want,read&notes=1&q=shoe+dog')
    expect(parseBrowse(browseSearch(state))).toEqual({ ...state, s: ['want', 'read'] })
    expect(browseSearch(EMPTY_BROWSE)).toBe('')
    expect(browseSearch({ ...EMPTY_BROWSE, q: '   ' })).toBe('')
  })
})

describe('layout', () => {
  test('parseLayout falls back to grid M on anything odd', () => {
    expect(parseLayout(null)).toEqual({ view: 'grid', size: 'm' })
    expect(parseLayout('junk')).toEqual({ view: 'grid', size: 'm' })
    expect(parseLayout({ view: 'table', size: 'xl' })).toEqual({ view: 'grid', size: 'm' })
    expect(parseLayout({ view: 'list', size: 'l' })).toEqual({ view: 'list', size: 'l' })
  })
  test('S/M/L are 10/8/5 columns at 1440px and 4/3/2 on a phone', () => {
    expect([columnsAt('s', 1440), columnsAt('m', 1440), columnsAt('l', 1440)]).toEqual([10, 8, 5])
    expect([columnsAt('s', 390), columnsAt('m', 390), columnsAt('l', 390)]).toEqual([4, 3, 2])
  })
  test('the literal Tailwind classes match the column table', () => {
    for (const size of ['s', 'm', 'l'] as const) expect(GRID_COLUMNS[size]).toBe(gridClasses(size))
  })
})
