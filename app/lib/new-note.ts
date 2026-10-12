// app/lib/new-note.ts
// "Add <thing>" in the Library: which fields each type asks for, and the markdown file
// (path + frontmatter) they turn into. Pure, so the writing step (git, later) can reuse it.
import type { SoiiConfig, TabConfig } from './types'

export interface NoteField {
  key: string
  label: string
  kind?: 'text' | 'number' | 'date' | 'select'
  options?: string[]
  placeholder?: string
}

/** A property written to the note that the dialog doesn't ask for. */
export interface ExtraProperty {
  key: string
  kind?: 'date'
  /** Comma-separated input, written as a YAML list. */
  list?: true
  /** Filled in by the builder. */
  auto?: 'today'
}

export interface NewNoteSpec {
  type: string
  noun: string
  folder: string
  fields: NoteField[]
  /** Written after `fields`. Not plain dialog inputs: the Add dialog shows `collection`/`category` as list pickers; Log builds from `fields`. */
  extra?: ExtraProperty[]
  defaults?: Record<string, string>
  /** Write every property, empty ones as a bare `key:`, so they're all there to fill in. */
  showEmpty?: boolean
}

const TITLE: NoteField = { key: 'title', label: 'Title' }
const COVER: NoteField = { key: 'cover', label: 'Cover (URL or [[file]])', placeholder: 'optional' }
const RATING: NoteField = { key: 'rating', label: 'Rating (1–5)', kind: 'number' }
const date = (key: string, label: string): NoteField => ({ key, label, kind: 'date' })
const status = (options: string[]): NoteField => ({ key: 'status', label: 'Status', kind: 'select', options })

const LIBRARY = '04-Resources/Library'

// The Library's section and subcategory (docs/frontmatter.md#collections-and-categories).
const LIBRARY_LISTS: ExtraProperty[] = [
  { key: 'collection', list: true },
  { key: 'category', list: true }
]

export const NEW_NOTE_SPECS: Record<string, NewNoteSpec> = {
  book: {
    type: 'book',
    noun: 'book',
    folder: `${LIBRARY}/Books`,
    fields: [TITLE, { key: 'author', label: 'Author' }, { key: 'isbn', label: 'ISBN' }, COVER, status(['want', 'reading', 'finished', 'abandoned']), RATING, date('started', 'Started'), date('finished', 'Finished')],
    // The owner's Obsidian clippings carry these too; a book note shows all of them, empty or not.
    extra: [
      { key: 'source' },
      { key: 'published', kind: 'date' },
      { key: 'created', kind: 'date', auto: 'today' },
      { key: 'description' },
      { key: 'collection', list: true },
      { key: 'category', list: true },
      { key: 'tags', list: true }
    ],
    showEmpty: true,
    defaults: { status: 'want' }
  },
  audiobook: {
    type: 'audiobook',
    noun: 'audiobook',
    folder: `${LIBRARY}/Audiobooks`,
    fields: [TITLE, { key: 'author', label: 'Author' }, { key: 'narrator', label: 'Narrator' }, { key: 'isbn', label: 'ISBN' }, COVER, status(['want', 'reading', 'finished', 'abandoned']), RATING, date('started', 'Started'), date('finished', 'Finished')],
    defaults: { status: 'want' },
    extra: LIBRARY_LISTS
  },
  movie: {
    type: 'movie',
    noun: 'movie',
    folder: `${LIBRARY}/Movies`,
    fields: [TITLE, { key: 'director', label: 'Director' }, { key: 'year', label: 'Year', kind: 'number' }, COVER, status(['watchlist', 'watched']), RATING, date('watched', 'Watched')],
    defaults: { status: 'watchlist' },
    extra: LIBRARY_LISTS
  },
  documentary: {
    type: 'documentary',
    noun: 'documentary',
    folder: `${LIBRARY}/Documentaries`,
    fields: [TITLE, { key: 'director', label: 'Director' }, { key: 'year', label: 'Year', kind: 'number' }, COVER, status(['watchlist', 'watched']), RATING, date('watched', 'Watched')],
    defaults: { status: 'watchlist' },
    extra: LIBRARY_LISTS
  },
  video: {
    type: 'video',
    noun: 'video',
    folder: `${LIBRARY}/Videos`,
    fields: [TITLE, { key: 'url', label: 'URL' }, { key: 'channel', label: 'Channel' }, COVER, date('watched', 'Watched')],
    extra: LIBRARY_LISTS
  },
  research: {
    type: 'research',
    noun: 'paper',
    folder: `${LIBRARY}/Research`,
    fields: [TITLE, { key: 'authors', label: 'Authors' }, { key: 'year', label: 'Year', kind: 'number' }, { key: 'venue', label: 'Venue' }, { key: 'url', label: 'URL' }, { key: 'doi', label: 'DOI' }, { key: 'arxiv', label: 'arXiv id' }, status(['to-read', 'reading', 'read'])],
    defaults: { status: 'to-read' },
    extra: LIBRARY_LISTS
  },
  article: {
    type: 'article',
    noun: 'article',
    folder: `${LIBRARY}/Articles`,
    fields: [TITLE, { key: 'url', label: 'URL' }, { key: 'author', label: 'Author' }],
    extra: LIBRARY_LISTS
  },
  recipe: {
    type: 'recipe',
    noun: 'recipe',
    folder: `${LIBRARY}/Recipes`,
    fields: [TITLE, { key: 'image', label: 'Picture (URL or [[file]])', placeholder: 'optional' }, { key: 'description', label: 'Description' }, { key: 'source', label: 'Source URL' }],
    extra: LIBRARY_LISTS
  },
  // A recorded log entry; the transcript goes in the body.
  'video-log': {
    type: 'video-log',
    noun: 'journal entry',
    folder: `${LIBRARY}/Journal`,
    fields: [TITLE, { key: 'video', label: 'Video (URL or [[file]])', placeholder: 'optional' }],
    extra: [{ key: 'date', kind: 'date', auto: 'today' }]
  }
}

// The spec for a tab, from the canonical type its query asks for (aliases resolve through
// config.types). Only the Library workspace gets "Add"; a tab with no single type gets none.
export function specForTab(workspaceId: string, tab: TabConfig, config: SoiiConfig): NewNoteSpec | null {
  if (workspaceId !== 'library') return null
  const clause = Array.isArray(tab.query) ? (tab.query.length === 1 ? tab.query[0] : null) : tab.query
  const wanted = typeof clause?.type === 'string' ? clause.type.toLowerCase() : null
  if (!wanted) return null
  const canonical = Object.keys(NEW_NOTE_SPECS).find(
    t => t === wanted || (config.types[t] ?? []).some(alias => alias.toLowerCase() === wanted)
  )
  return canonical ? NEW_NOTE_SPECS[canonical] : null
}

// Quote anything YAML could misread: reserved words, numbers, a leading indicator, ': ' or ' #'.
export function yamlString(value: string): string {
  const plain = /^[^\s"'\[\]{}>|*&!%@`#,?:-][^#]*$/.test(value) && !/(: | #|:$)/.test(value) && !/\s$/.test(value)
  const reserved = /^(true|false|yes|no|on|off|null|~)$/i.test(value) || /^[-+]?[\d.,_]+(e[-+]?\d+)?$/i.test(value)
  return plain && !reserved ? value : JSON.stringify(value)
}

function yamlValue(field: { kind?: string }, raw: string): string {
  if (field.kind === 'number' && /^\d+(\.\d+)?$/.test(raw)) return raw
  if (field.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return yamlString(raw)
}

// Characters that aren't allowed in file names on at least one OS, plus Obsidian's own link-breakers.
export function fileNameFor(title: string): string {
  const name = title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120).trim()
  return name || 'Untitled'
}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function buildNote(spec: NewNoteSpec, values: Record<string, string>, today = localDate()): { path: string; content: string } {
  const title = (values.title ?? '').replace(/\s+/g, ' ').trim()
  const lines = [`type: ${spec.type}`]
  const properties: (NoteField | ExtraProperty)[] = [...spec.fields, ...(spec.extra ?? [])]
  for (const property of properties) {
    // One line per property: a newline in a value must not be able to add frontmatter keys.
    let raw = (values[property.key] ?? '').replace(/\s+/g, ' ').trim()
    if (!raw && 'auto' in property && property.auto === 'today') raw = today
    if ('list' in property && property.list) {
      const items = raw.split(',').map(i => i.trim()).filter(Boolean)
      if (items.length) lines.push(`${property.key}:`, ...items.map(i => `  - ${yamlString(i)}`))
      else if (spec.showEmpty) lines.push(`${property.key}:`)
    } else if (raw) lines.push(`${property.key}: ${yamlValue(property, raw)}`)
    else if (spec.showEmpty) lines.push(`${property.key}:`)
  }
  const content = `---\n${lines.join('\n')}\n---\n\n# ${title || 'Untitled'}\n`
  return { path: `${spec.folder}/${fileNameFor(title)}.md`, content }
}
