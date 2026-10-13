import { describe, expect, test } from 'bun:test'
import { bucket, facetSuggestions, foldKey, humanize, libraryRoot, listOf, noteCategories, noteCollections, parseListInput } from './collections'
import { note } from './life-test-utils'

const ROOT = '04-Resources/Library/Books'
const book = (id: string, fm: Record<string, unknown> = {}, tags: string[] = []) => note(`${ROOT}/${id}`, { type: 'book', ...fm }, { tags })

describe('humanize and foldKey', () => {
  test('splits camel case, dashes and underscores, and capitalises the first letter', () => {
    expect(humanize('ReadingList')).toBe('Reading List')
    expect(humanize('AIBooks')).toBe('AI Books')
    expect(humanize('self-help_books')).toBe('Self help books')
    expect(humanize(' biographies ')).toBe('Biographies')
    expect(humanize('Leadership & Management')).toBe('Leadership & Management')
  })
  test('keys are trimmed, single-spaced, lower case', () => {
    expect(foldKey(' Startup  Books ')).toBe('startup books')
  })
})

describe('listOf', () => {
  test('a string, a number or a (nested) list of them; blanks dropped', () => {
    expect(listOf('Biographies')).toEqual(['Biographies'])
    expect(listOf([' a ', '', null, 3, ['b']])).toEqual(['a', '3', 'b'])
    expect(listOf(null)).toEqual([])
    expect(listOf('')).toEqual([])
    expect(listOf({})).toEqual([])
  })
})

describe('libraryRoot', () => {
  test('the Add spec folder for library types, else null', () => {
    expect(libraryRoot('book')).toBe(ROOT)
    expect(libraryRoot('person')).toBeNull()
    expect(libraryRoot(null)).toBeNull()
    expect(libraryRoot('constructor')).toBeNull()
  })
})

describe('noteCollections', () => {
  test('the collection field wins', () => {
    expect(noteCollections(book('ReadingList/A', { collection: ['Favourites'] }, ['ReadingList']), ROOT)).toEqual(['Favourites'])
    expect(noteCollections(book('A', { collection: 'Favourites' }), ROOT)).toEqual(['Favourites'])
  })
  test('else tags that name a folder below the root (case, spaces, dashes ignored)', () => {
    expect(noteCollections(book('Startup-Books/A', {}, ['readinglist', 'founder-mindset']), ROOT)).toEqual(['Startup-Books'])
  })
  test('tag fallback returns the folder spelling, not the lowercased tag', () => {
    expect(noteCollections(book('ReadingList/A', {}, ['readinglist']), ROOT)).toEqual(['ReadingList'])
  })
  test('else the deepest folder below the root', () => {
    expect(noteCollections(book('ReadingList/A'), ROOT)).toEqual(['ReadingList'])
    expect(noteCollections(book('Gifts/2024/A'), ROOT)).toEqual(['2024'])
  })
  test('none for a note at the root, even with a list-like tag', () => {
    expect(noteCollections(book('A', {}, ['ReadingList', 'Library']), ROOT)).toEqual([])
  })
  test('without a root, tags restating the type never count', () => {
    expect(noteCollections(note('Notes/Books/A', { type: 'book' }, { tags: ['books'] }), null)).toEqual([])
    expect(noteCollections(note('Notes/Reads/A', { type: 'book' }, { tags: ['reads'] }), null)).toEqual(['Reads'])
  })
})

describe('noteCategories', () => {
  test('a string or a list; missing is empty', () => {
    expect(noteCategories(book('A', { category: 'Biographies' }))).toEqual(['Biographies'])
    expect(noteCategories(book('A', { category: ['Biographies', 'Leadership'] }))).toEqual(['Biographies', 'Leadership'])
    expect(noteCategories(book('A', { category: null }))).toEqual([])
  })
})

describe('bucket', () => {
  test('case-insensitive and trimmed, most common spelling, count desc, a note counted once per value', () => {
    expect(bucket([['Biographies'], ['biographies '], ['Biographies'], ['leadership'], [], ['Leadership', 'leadership']])).toEqual([
      { key: 'biographies', value: 'Biographies', label: 'Biographies', count: 3 },
      { key: 'leadership', value: 'leadership', label: 'Leadership', count: 2 }
    ])
  })
})

describe('facetSuggestions', () => {
  test('existing values of that type, with counts, using the collection fallback', () => {
    const notes = [book('ReadingList/A', { category: 'Biographies' }), book('ReadingList/B'), note('People/Anna', { type: 'person', category: 'Friends' })]
    expect(facetSuggestions(notes, 'book', 'collection')).toEqual([{ key: 'readinglist', value: 'ReadingList', label: 'Reading List', count: 2 }])
    expect(facetSuggestions(notes, 'book', 'category').map(f => [f.value, f.count])).toEqual([['Biographies', 1]])
  })
})

describe('parseListInput', () => {
  test('splits on commas, trims, drops blanks and case-duplicates', () => {
    expect(parseListInput(' A, b ,a,, ', 'Category')).toEqual({ ok: true, items: ['A', 'b'] })
    expect(parseListInput('', 'Category')).toEqual({ ok: true, items: [] })
  })
  test('at most 5 items of at most 60 characters', () => {
    expect(parseListInput('a,b,c,d,e,f', 'Collection')).toEqual({ ok: false, message: 'Collection takes at most 5 values.' })
    expect(parseListInput('x'.repeat(61), 'Category')).toEqual({ ok: false, message: 'Each category is at most 60 characters.' })
    expect(parseListInput('x'.repeat(60), 'Category').ok).toBe(true)
  })
})
