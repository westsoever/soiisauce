// A tiny compiled-vault directory (spec §7.4 layout) for server tests, built
// without the compiler so Track B doesn't depend on Track A.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import MiniSearch from 'minisearch'
import { DEFAULT_CONFIG } from '../lib/default-config'
import { noteFileName } from '../lib/note-file'
import { SEARCH_OPTIONS, type SearchDoc } from '../lib/search-options'
import type { NoteDoc, NoteMeta, VaultIndex } from '../lib/types'

const meta = (id: string, title: string, extra: Partial<NoteMeta> = {}): NoteMeta => ({
  id,
  title,
  path: `${id}.md`,
  folder: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '',
  type: null,
  tags: [],
  date: null,
  updated: null,
  frontmatter: {},
  excerpt: '',
  image: null,
  wordCount: 2,
  ...extra
})

export const FIXTURE_NOTES: NoteMeta[] = [
  meta('People/Anna', 'Anna', { type: 'person', excerpt: 'Partner who likes long walks.' }),
  meta('Weird/Café & ? 100%', 'Café', { excerpt: 'unicode body' })
]

export function makeGeneratedFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'soii-generated-'))
  mkdirSync(join(dir, 'notes'))
  mkdirSync(join(dir, 'files', 'assets'), { recursive: true })
  const index: VaultIndex = {
    vaultCommit: 'abc1234',
    builtAt: '2026-10-11T20:00:00.000Z',
    config: DEFAULT_CONFIG,
    notes: FIXTURE_NOTES,
    folders: { name: '', path: '', folders: [], notes: FIXTURE_NOTES.map(n => n.id) },
    warnings: []
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index))
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ commit: 'def5678', vaultCommit: 'abc1234', builtAt: index.builtAt }))
  for (const n of FIXTURE_NOTES) {
    const doc: NoteDoc = { ...n, html: `<p>${n.excerpt}</p>`, headings: [], outgoing: [], backlinks: [] }
    writeFileSync(join(dir, 'notes', noteFileName(n.id)), JSON.stringify(doc))
  }
  const ms = new MiniSearch<SearchDoc>(SEARCH_OPTIONS)
  ms.addAll(FIXTURE_NOTES.map(n => ({ id: n.id, title: n.title, path: n.path, headings: '', tags: '', text: n.excerpt, snippetText: n.excerpt })))
  writeFileSync(join(dir, 'search.json'), JSON.stringify(ms))
  writeFileSync(join(dir, 'files', 'assets', 'pic.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  writeFileSync(join(dir, 'files', 'assets', 'evil.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  return dir
}
