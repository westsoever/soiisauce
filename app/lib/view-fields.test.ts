import { describe, expect, test } from 'bun:test'
import type { NoteMeta } from './types'
import { fieldValues, vaultFields } from './view-fields'

const note = (id: string, fm: Record<string, unknown>, extra: Partial<NoteMeta> = {}): NoteMeta =>
  ({ id, title: id, path: `${id}.md`, folder: '', type: (fm.type as string) ?? null, tags: [], date: null, updated: null, frontmatter: fm, excerpt: '', image: null, wordCount: 0, ...extra }) as NoteMeta

const NOTES = [
  note('a', { type: 'book', category: ['History', 'War'], status: 'read', rating: 5 }, { tags: ['scifi'], folder: 'Library' }),
  note('b', { type: 'book', category: 'history', status: 'want' }, { tags: ['scifi', 'space'], folder: 'Library' }),
  note('c', { type: 'person', relationship: 'friend' }, { folder: 'People' }),
  note('d', { title: 'no type', meta: { nested: true } })
]

describe('fieldValues', () => {
  test('counts notes per value, folding case, most common spelling wins, most used first', () => {
    expect(fieldValues(NOTES, 'category')).toEqual([
      { key: 'history', value: 'History', label: 'History', count: 2 },
      { key: 'war', value: 'War', label: 'War', count: 1 }
    ])
  })
  test('type, tag and folder read the note, not the frontmatter', () => {
    expect(fieldValues(NOTES, 'type').map(f => [f.value, f.count])).toEqual([['book', 2], ['person', 1]])
    expect(fieldValues(NOTES, 'tag').map(f => [f.value, f.count])).toEqual([['scifi', 2], ['space', 1]])
    expect(fieldValues(NOTES, 'folder').map(f => [f.value, f.count])).toEqual([['Library', 2], ['People', 1]])
  })
  test('skips empty and non-scalar values; numbers become text', () => {
    expect(fieldValues(NOTES, 'meta')).toEqual([])
    expect(fieldValues(NOTES, 'rating')).toEqual([{ key: '5', value: '5', label: '5', count: 1 }])
  })
})

describe('vaultFields', () => {
  test('lists frontmatter keys by how many notes use them, without type/tags/title', () => {
    const f = vaultFields(NOTES)
    expect(f.types.map(t => t.value)).toEqual(['book', 'person'])
    expect(f.fields.map(x => [x.field, x.count])).toEqual([['category', 2], ['status', 2], ['rating', 1], ['relationship', 1]])
    expect(f.fields.find(x => x.field === 'meta')).toBeUndefined()
  })
})
