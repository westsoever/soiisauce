import { describe, expect, test } from 'bun:test'
import { DEFAULT_CONFIG } from './default-config'
import type { NoteMeta, TabConfig, WorkspaceConfig } from './types'
import { overlap, similarTabs } from './view-overlap'

const note = (id: string, type: string, status = 'x'): NoteMeta =>
  ({ id, title: id, path: `${id}.md`, folder: '', type, tags: [], date: null, updated: null, frontmatter: { type, status }, excerpt: '', image: null, wordCount: 0 }) as NoteMeta
const books = Array.from({ length: 10 }, (_, i) => note(`b${i}`, 'book', i < 8 ? 'read' : 'want'))
const people = [note('p1', 'person')]
const index = { notes: [...books, ...people], config: DEFAULT_CONFIG }
const tab = (id: string, query: TabConfig['query']): TabConfig => ({ id, title: id.toUpperCase(), view: 'list', query })
const ws: WorkspaceConfig = { id: 'library', title: 'Library', tabs: [tab('all', { type: 'book' }), tab('people', { type: 'person' }), tab('none', { type: 'nothing' })] }

describe('overlap', () => {
  test('identical, disjoint, partial, empty', () => {
    expect(overlap(books, books)).toBe(1)
    expect(overlap(books, people)).toBe(0)
    expect(overlap(books.slice(0, 8), books)).toBe(0.8)
    expect(overlap([], [])).toBe(0)
  })
})

describe('similarTabs', () => {
  test('finds tabs at 0.8 or more, highest first, never the draft itself or two empty tabs', () => {
    expect(similarTabs(tab('draft', { type: 'book', where: { status: 'read' } }), ws, index)).toEqual([{ tabId: 'all', title: 'ALL', overlap: 0.8 }])
    expect(similarTabs(tab('draft', { type: 'book', where: { status: 'want' } }), ws, index)).toEqual([])
    expect(similarTabs(tab('all', { type: 'book' }), ws, index)).toEqual([])
    expect(similarTabs(tab('draft', { type: 'ghost' }), ws, index)).toEqual([])
  })
})
