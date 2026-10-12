// app/lib/log.test.ts
import { describe, expect, test } from 'bun:test'
import { autoDates, buildNewNote, creatingKind, fieldsFor, formatEntry, kindById, LOG_KINDS, localDay, numberValue, type LogKind } from './log'

const kind = (id: string): LogKind => {
  const k = kindById(id)
  if (!k) throw new Error(`no kind ${id}`)
  return k
}
const D = '2026-10-12'

describe('kinds', () => {
  test('ids are unique; the picker starts with the everyday kinds', () => {
    const ids = LOG_KINDS.map(k => k.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(LOG_KINDS.filter(k => !k.secondary).map(k => k.id)).toEqual(['conversation', 'person', 'book', 'movie', 'goal', 'expense', 'note'])
    expect(LOG_KINDS.filter(k => k.secondary).map(k => k.id)).toEqual(['audiobook', 'documentary', 'video', 'article', 'research'])
    expect(kindById('__proto__')).toBeNull()
    expect(kindById('constructor')).toBeNull()
  })

  test('library kinds: status, rating, collection and category are quick; the rest is more', () => {
    expect(kind('book').quick.map(f => f.key)).toEqual(['status', 'rating', 'collection', 'category'])
    expect(kind('book').more.map(f => f.key)).toEqual(['author', 'isbn', 'cover', 'started', 'finished'])
    expect(kind('article').quick.filter(f => f.kind === 'list').map(f => f.key)).toEqual(['collection', 'category'])
    expect(fieldsFor(kind('movie'), 'append').map(f => f.key)).toEqual(expect.arrayContaining(['collection', 'category']))
    expect(kind('book').folder).toBe('04-Resources/Library/Books')
    expect(kind('book').section).toBe('Log')
    expect(kind('movie').quick.find(f => f.key === 'status')?.options).toEqual(['watchlist', 'watched'])
  })

  test('a conversation creates a person and appends with no fields', () => {
    expect(creatingKind(kind('conversation')).id).toBe('person')
    expect(fieldsFor(kind('conversation'), 'append')).toEqual([])
    expect(fieldsFor(kind('conversation'), 'new').map(f => f.key)).toContain('relationship')
    expect(kind('conversation').howOptions).toEqual(['met', 'call', 'text'])
  })

  test('new-only fields are never patched onto an existing note', () => {
    expect(fieldsFor(kind('note'), 'new').map(f => f.key)).toEqual(['tags'])
    expect(fieldsFor(kind('note'), 'append')).toEqual([])
  })

  test('expense never appends', () => {
    expect(kind('expense').section).toBeNull()
  })
})

describe('localDay and numberValue', () => {
  test('localDay is the local calendar day, also late at night', () => {
    expect(localDay(new Date(2026, 9, 12, 23, 30))).toBe('2026-10-12')
    expect(localDay(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
  })

  test('numberValue reads 12, 12.5 and the Danish 120,50', () => {
    expect(numberValue('12')).toBe(12)
    expect(numberValue(' 12.5 ')).toBe(12.5)
    expect(numberValue('120,50')).toBe(120.5)
    expect(numberValue('1.000,00')).toBeNull()
    expect(numberValue('abc')).toBeNull()
    expect(numberValue('')).toBeNull()
  })
})

describe('autoDates', () => {
  test('finishing a book or watching a film fills the date when it is empty', () => {
    expect(autoDates(kind('book'), { status: 'finished' }, D)).toEqual({ status: 'finished', finished: D })
    expect(autoDates(kind('book'), { status: 'finished' }, D, { finished: '2026-01-01' })).toEqual({ status: 'finished' })
    expect(autoDates(kind('book'), { status: 'finished', finished: '2026-10-01' }, D)).toEqual({ status: 'finished', finished: '2026-10-01' })
    expect(autoDates(kind('movie'), { status: 'watched' }, D)).toEqual({ status: 'watched', watched: D })
    expect(autoDates(kind('goal'), { status: 'done' }, D)).toEqual({ status: 'done' })
  })
})

describe('formatEntry', () => {
  test('one dated bullet, with (how) for conversations', () => {
    expect(formatEntry({ date: D, text: 'Talked about the pilot.', how: 'call' })).toBe('- 2026-10-12 (call) — Talked about the pilot.')
  })

  test('more lines become indented continuation lines of the same bullet', () => {
    expect(formatEntry({ date: D, text: '  first\r\n\r\nsecond  \n' })).toBe('- 2026-10-12 — first\n\n  second')
  })

  test('typed headings and rules stay inside the bullet', () => {
    expect(formatEntry({ date: D, text: 'a\n## Log\n---' })).toBe('- 2026-10-12 — a\n  ## Log\n  ---')
  })

  test('with no text, the field changes are the entry', () => {
    expect(formatEntry({ date: D, text: '', changes: { status: 'finished', rating: '5' } })).toBe('- 2026-10-12 — status → finished, rating → 5')
  })
})

describe('buildNewNote', () => {
  test('collection and category are written last as block lists, like the Library and the Add dialog', () => {
    const n = buildNewNote({ kind: kind('book'), title: 'Dune', values: { status: 'want', collection: 'StartupBooks', category: 'Biographies, Leadership & Management' }, text: '', date: D })
    expect(n.content).toBe(
      '---\ntype: book\nstatus: want\ncollection:\n  - StartupBooks\ncategory:\n  - Biographies\n  - Leadership & Management\ncreated: 2026-10-12\n---\n\n# Dune\n'
    )
  })

  test('a book: type, quick then more fields, created, heading and text', () => {
    const n = buildNewNote({ kind: kind('book'), title: ' Dune ', values: { status: 'reading', rating: '4', author: 'Frank Herbert' }, text: 'Great so far.', date: D })
    expect(n.path).toBe('04-Resources/Library/Books/Dune.md')
    expect(n.title).toBe('Dune')
    expect(n.content).toBe('---\ntype: book\nstatus: reading\nrating: 4\nauthor: Frank Herbert\ncreated: 2026-10-12\n---\n\n# Dune\n\nGreat so far.\n')
  })

  test('a finished book gets its finished date', () => {
    const n = buildNewNote({ kind: kind('book'), title: 'Dune', values: { status: 'finished' }, text: '', date: D })
    expect(n.content).toBe('---\ntype: book\nstatus: finished\nfinished: 2026-10-12\ncreated: 2026-10-12\n---\n\n# Dune\n')
  })

  test('a conversation with someone new creates a person card with the first entry', () => {
    const n = buildNewNote({ kind: kind('conversation'), title: 'Ada Fernsby', values: { relationship: 'techbbq', company: 'Brightwell' }, text: 'Met at the meetup.', date: D, how: 'met' })
    expect(n.path).toBe('05-Knowledge/People/Ada Fernsby.md')
    expect(n.content).toBe(
      [
        '---',
        'type: person',
        'relationship: techbbq',
        'company: Brightwell',
        'tags: [people, techbbq]',
        'created: 2026-10-12',
        'updated: 2026-10-12',
        '---',
        '',
        '# Ada Fernsby',
        '',
        '## Who they are',
        '',
        '## Notes & dated interactions',
        '',
        '- 2026-10-12 (met) — Met at the meetup.',
        '',
        '## Sources',
        '',
        '- soii log, 2026-10-12',
        ''
      ].join('\n')
    )
  })

  test('a person with no text has an empty notes section', () => {
    const n = buildNewNote({ kind: kind('person'), title: 'Ida', values: {}, text: '', date: D })
    expect(n.content).toContain('tags: [people]\n')
    expect(n.content).toContain('## Notes & dated interactions\n\n## Sources\n')
  })

  test('an expense: dated file name, title falls back to the category, amount as a number', () => {
    const n = buildNewNote({ kind: kind('expense'), title: '', values: { amount: '120,50', currency: 'DKK', category: 'food' }, text: '', date: D })
    expect(n.path).toBe('03-Areas/Finance/Expenses/2026-10-12 food.md')
    expect(n.content).toBe('---\ntype: expense\namount: 120.5\ncurrency: DKK\ncategory: food\ndate: 2026-10-12\n---\n\n# food\n')
  })

  test('a note goes to the inbox with its tags as a list', () => {
    const n = buildNewNote({ kind: kind('note'), title: 'Idea: soii voice log', values: { tags: 'idea, #soii' }, text: 'Dictate logs.', date: D })
    expect(n.path).toBe('00-Inbox/Idea soii voice log.md')
    expect(n.content).toBe('---\ntags: [idea, soii]\ncreated: 2026-10-12\n---\n\n# Idea: soii voice log\n\nDictate logs.\n')
  })

  test('a hostile title stays a file inside the kind folder', () => {
    const n = buildNewNote({ kind: kind('book'), title: '../../etc/passwd', values: {}, text: '', date: D })
    expect(n.path.startsWith('04-Resources/Library/Books/')).toBe(true)
    expect(n.path.split('/')).not.toContain('..')
    expect(n.path.endsWith('.md')).toBe(true)
  })

  test('a newline in a value cannot add a frontmatter key', () => {
    const n = buildNewNote({ kind: kind('book'), title: 'Dune', values: { author: 'X\ntype: hidden' }, text: '', date: D })
    expect(n.content).toContain('author: "X type: hidden"\n')
    expect(n.content.split('\n').filter(l => l.startsWith('type:'))).toEqual(['type: book'])
  })
})
