// app/lib/new-note.test.ts
import { describe, expect, test } from 'bun:test'
import { DEFAULT_CONFIG } from './default-config'
import { NEW_NOTE_SPECS, buildNote, fileNameFor, specForTab } from './new-note'

const library = DEFAULT_CONFIG.workspaces.find(w => w.id === 'library')!

describe('specForTab', () => {
  test('every default Library tab gets a spec', () => {
    for (const tab of library.tabs) expect(specForTab('library', tab, DEFAULT_CONFIG)).not.toBeNull()
    expect(specForTab('library', library.tabs[0], DEFAULT_CONFIG)?.type).toBe('book')
    expect(specForTab('library', library.tabs[5], DEFAULT_CONFIG)?.type).toBe('research')
  })

  test('other workspaces get none', () => {
    const goals = DEFAULT_CONFIG.workspaces.find(w => w.id === 'goals')!
    expect(specForTab('goals', goals.tabs[0], DEFAULT_CONFIG)).toBeNull()
  })

  test('an alias in the tab query resolves to the canonical type', () => {
    const tab = { ...library.tabs[0], query: { type: 'Books' } }
    expect(specForTab('library', tab, DEFAULT_CONFIG)?.type).toBe('book')
  })

  test('a tab with several clauses or no type gets none', () => {
    expect(specForTab('library', { ...library.tabs[0], query: [{ type: 'book' }, { type: 'movie' }] }, DEFAULT_CONFIG)).toBeNull()
    expect(specForTab('library', { ...library.tabs[0], query: { tag: 'x' } }, DEFAULT_CONFIG)).toBeNull()
  })
})

describe('buildNote', () => {
  test('a book lists every property, empty ones bare, filled ones unquoted where YAML allows', () => {
    const { path, content } = buildNote(
      NEW_NOTE_SPECS.book,
      { title: 'Dune', author: 'Frank Herbert', cover: '[[dune-cover.jpg]]', status: 'finished', rating: '5', finished: '2026-03-01', category: 'Product Management, Fiction', tags: 'ReadingList, sci-fi' },
      '2026-10-12'
    )
    expect(path).toBe('04-Resources/Library/Books/Dune.md')
    expect(content).toBe(
      [
        '---',
        'type: book',
        'title: Dune',
        'author: Frank Herbert',
        'isbn:',
        'cover: "[[dune-cover.jpg]]"',
        'status: finished',
        'rating: 5',
        'started:',
        'finished: 2026-03-01',
        'source:',
        'published:',
        'created: 2026-10-12',
        'description:',
        'collection:',
        'category:',
        '  - Product Management',
        '  - Fiction',
        'tags:',
        '  - ReadingList',
        '  - sci-fi',
        '---',
        '',
        '# Dune',
        ''
      ].join('\n')
    )
  })

  test('empty tags and the created date still show up on a bare book', () => {
    const { content } = buildNote(NEW_NOTE_SPECS.book, { title: 'X' }, '2026-10-12')
    expect(content).toContain('\ncreated: 2026-10-12\n')
    expect(content).toContain('\ncollection:\ncategory:\ntags:\n---')
    expect(content).toContain('\nstatus:\n')
  })

  test('other types still skip empty fields', () => {
    expect(buildNote(NEW_NOTE_SPECS.movie, { title: 'Heat', rating: '4' }).content).toBe('---\ntype: movie\ntitle: Heat\nrating: 4\n---\n\n# Heat\n')
  })

  test('quotes titles YAML would misread', () => {
    const { content } = buildNote(NEW_NOTE_SPECS.book, { title: "Ægir's Saga #1" })
    expect(content).toContain('title: "Ægir\'s Saga #1"')
    expect(buildNote(NEW_NOTE_SPECS.book, { title: 'Why: a book' }).content).toContain('title: "Why: a book"')
    expect(buildNote(NEW_NOTE_SPECS.book, { title: '1984' }).content).toContain('title: "1984"')
    expect(buildNote(NEW_NOTE_SPECS.book, { title: 'No' }).content).toContain('title: "No"')
  })

  test('a malformed number or date is written as a string, not dropped', () => {
    const { content } = buildNote(NEW_NOTE_SPECS.book, { title: 'X', rating: 'five', finished: 'March' })
    expect(content).toContain('rating: five')
    expect(content).toContain('finished: March')
  })

  test('an empty title still produces a valid note', () => {
    const { path, content } = buildNote(NEW_NOTE_SPECS.movie, {})
    expect(path).toBe('04-Resources/Library/Movies/Untitled.md')
    expect(content).toBe('---\ntype: movie\n---\n\n# Untitled\n')
  })
})

describe('fileNameFor', () => {
  test('strips characters that break file names and links', () => {
    expect(fileNameFor('AC/DC: Live? [1991] #1')).toBe('AC DC Live 1991 1')
    expect(fileNameFor('  ..hidden ')).toBe('hidden')
    expect(fileNameFor('///')).toBe('Untitled')
  })

  test('every Library type can carry a collection and a category list', () => {
    for (const type of ['book', 'audiobook', 'movie', 'documentary', 'video', 'research', 'article']) {
      const keys = (NEW_NOTE_SPECS[type].extra ?? []).filter(p => p.list).map(p => p.key)
      expect(keys).toEqual(expect.arrayContaining(['collection', 'category']))
    }
    expect(buildNote(NEW_NOTE_SPECS.movie, { title: 'Heat', collection: 'Criterion', category: 'Crime, Thriller' }).content).toBe(
      '---\ntype: movie\ntitle: Heat\ncollection:\n  - Criterion\ncategory:\n  - Crime\n  - Thriller\n---\n\n# Heat\n'
    )
  })
})
