import { describe, expect, test } from 'bun:test'
import { note } from './life-test-utils'
import { ancestors, doneCount, findNote, parentName, parentOf, subprojectMap, subprojectsOf } from './subprojects'

const project = (id: string, frontmatter: Record<string, unknown> = {}) => note(id, { type: 'project', ...frontmatter })

describe('parentName', () => {
  test('reads a quoted wikilink, an alias, an unquoted link and a plain name', () => {
    expect(parentName({ parent: '[[Balcony garden]]' })).toBe('Balcony garden')
    expect(parentName({ parent: '[[Balcony garden|the big one]]' })).toBe('Balcony garden')
    expect(parentName({ parent: '[[Balcony garden#Plan]]' })).toBe('Balcony garden')
    expect(parentName({ parent: [['Balcony garden']] })).toBe('Balcony garden')
    expect(parentName({ parent: ' Balcony garden ' })).toBe('Balcony garden')
  })

  test('empty, missing and URL values are no parent', () => {
    for (const parent of [undefined, null, '', '  ', [], 'https://example.com/x', { a: 1 }]) expect(parentName({ parent })).toBeNull()
  })
})

describe('findNote', () => {
  test('matches the id or its last part, ignoring case and .md, and prefers the shortest id', () => {
    const notes = [note('Deep/Folder/Balcony garden'), note('Balcony garden'), note('02-Projects/Raised beds')]
    expect(findNote(notes, 'balcony garden.md')?.id).toBe('Balcony garden')
    expect(findNote(notes, 'Raised beds')?.id).toBe('02-Projects/Raised beds')
    expect(findNote(notes, 'Missing')).toBeUndefined()
  })
})

describe('parentOf and ancestors', () => {
  const garden = project('02-Projects/Balcony garden')
  const beds = project('02-Projects/Raised beds', { parent: '[[Balcony garden]]' })
  const vesting = project('02-Projects/Vesting', { parent: '[[Raised beds]]' })
  const notes = [garden, beds, vesting]

  test('a subproject resolves its parent; a top-level project and a broken link have none', () => {
    expect(parentOf(beds, notes)?.id).toBe(garden.id)
    expect(parentOf(garden, notes)).toBeUndefined()
    expect(parentOf(project('x', { parent: '[[Nope]]' }), notes)).toBeUndefined()
  })

  test('the chain runs from the nearest parent outwards', () => {
    expect(ancestors(vesting, notes)).toEqual({ chain: [beds, garden], cycle: false })
    expect(ancestors(garden, notes)).toEqual({ chain: [], cycle: false })
  })

  test('a loop is reported on its members and ends the walk', () => {
    const a = project('A', { parent: '[[B]]' })
    const b = project('B', { parent: '[[C]]' })
    const c = project('C', { parent: '[[A]]' })
    expect(ancestors(a, [a, b, c])).toEqual({ chain: [b, c], cycle: true })
  })

  test('a project that is its own parent is a loop', () => {
    const me = project('Me', { parent: '[[Me]]' })
    expect(ancestors(me, [me])).toEqual({ chain: [], cycle: true })
  })

  test('a project below a loop stops at it without being part of it', () => {
    const a = project('A', { parent: '[[B]]' })
    const b = project('B', { parent: '[[A]]' })
    const tail = project('Tail', { parent: '[[A]]' })
    expect(ancestors(tail, [a, b, tail])).toEqual({ chain: [a, b], cycle: false })
  })
})

describe('subprojectsOf', () => {
  const garden = project('Balcony garden')

  test('lists the projects that point at it: open first, then done, each by title', () => {
    const done = project('Zed', { parent: '[[Balcony garden]]', status: 'Done' })
    const later = project('Beta', { parent: '[[Balcony garden]]', status: 'idea' })
    const first = project('Alpha', { parent: '[[Balcony garden]]' })
    const other = project('Other', { parent: '[[Elsewhere]]' })
    const list = subprojectsOf(garden, [garden, done, later, first, other, project('Solo')])
    expect(list.map(n => n.title)).toEqual(['Alpha', 'Beta', 'Zed'])
    expect(doneCount(list)).toBe(1)
  })

  test('only projects count, and a project is never its own subproject', () => {
    const idea = note('Idea', { type: 'idea', parent: '[[Balcony garden]]' })
    const self = project('Balcony garden', { parent: '[[Balcony garden]]' })
    expect(subprojectsOf(self, [self, idea])).toEqual([])
  })

  test('subprojectMap groups every parent at once, ignoring broken parents and self-parents', () => {
    const a = project('A')
    const b = project('B', { parent: '[[A]]' })
    const c = project('C', { parent: '[[B]]' })
    const lost = project('Lost', { parent: '[[Nowhere]]' })
    const self = project('Self', { parent: '[[Self]]' })
    const map = subprojectMap([a, b, c, lost, self])
    expect([...map.keys()]).toEqual(['A', 'B'])
    expect(map.get('A')).toEqual([b])
    expect(map.get('B')).toEqual([c])
  })

  test('a name that exists in two folders belongs to the shortest id', () => {
    const top = project('Balcony garden')
    const nested = project('Archive/Balcony garden')
    const sub = project('Sub', { parent: '[[Balcony garden]]' })
    expect(subprojectsOf(top, [nested, top, sub]).map(n => n.id)).toEqual(['Sub'])
    expect(subprojectsOf(nested, [nested, top, sub])).toEqual([])
  })
})
