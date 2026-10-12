// Test-only factories for the life-workspace logic (board, stats, person).
import type { NoteMeta, VaultIndex } from './types'

export function note(id: string, frontmatter: Record<string, unknown> = {}, extra: Partial<NoteMeta> = {}): NoteMeta {
  const slash = id.lastIndexOf('/')
  return {
    id,
    title: slash === -1 ? id : id.slice(slash + 1),
    path: `${id}.md`,
    folder: slash === -1 ? '' : id.slice(0, slash),
    type: typeof frontmatter.type === 'string' ? frontmatter.type.toLowerCase() : null,
    tags: [],
    date: null,
    updated: null,
    frontmatter,
    excerpt: '',
    image: null,
    wordCount: 0,
    ...extra
  }
}

export function indexOf(notes: NoteMeta[]): VaultIndex {
  return {
    vaultCommit: null,
    builtAt: '2026-10-11T00:00:00.000Z',
    config: { title: 'soii', home: 'today', exclude: [], types: {}, workspaces: [] },
    notes,
    folders: { name: '', path: '', folders: [], notes: [] },
    warnings: []
  }
}
