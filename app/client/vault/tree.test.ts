// app/client/vault/tree.test.ts
import { describe, expect, test } from 'bun:test'
import type { FolderNode, NoteMeta } from '../../lib/types'
import { countNotes } from './FolderTree'
import { recentNotes } from './VaultPage'

const n = (id: string, date: string | null, updated: string | null = null) =>
  ({ id, title: id, path: `${id}.md`, folder: '', type: null, tags: [], date, updated, frontmatter: {}, excerpt: '', image: null, wordCount: 0 }) as NoteMeta

describe('vault page helpers', () => {
  test('countNotes counts recursively', () => {
    const tree: FolderNode = { name: '', path: '', notes: ['a'], folders: [{ name: 'x', path: 'x', notes: ['x/b', 'x/c'], folders: [{ name: 'y', path: 'x/y', notes: ['x/y/d'], folders: [] }] }] }
    expect(countNotes(tree)).toBe(4)
  })
  test('recentNotes sorts by updated ?? date, drops undated, limits', () => {
    const notes = [n('old', '2025-01-01'), n('none', null), n('new', '2026-01-01'), n('edited', '2024-01-01', '2026-06-01')]
    expect(recentNotes(notes).map(x => x.id)).toEqual(['edited', 'new', 'old'])
    expect(recentNotes(notes, 1).map(x => x.id)).toEqual(['edited'])
  })
})
