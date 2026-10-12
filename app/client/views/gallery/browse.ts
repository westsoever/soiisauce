// Library browsing (docs/superpowers/specs/2026-10-12-library-browse-design.md): sections
// (collections), subcategories (categories), status and Has-my-notes filters, grouping into
// capped shelves, URL state and grid sizes. Pure, so it is unit-tested; LibraryBrowse renders it.
import { bucket, foldKey, libraryRoot, noteCategories, noteCollections, UNCATEGORIZED, type Facet } from '../../../lib/collections'
import type { NoteMeta } from '../../../lib/types'

export type Status = 'want' | 'reading' | 'read'
export const STATUS_IDS: Status[] = ['want', 'reading', 'read']
const STATUS_WORDS = new Map<string, Status>([
  ['want', 'want'],
  ['to-read', 'want'],
  ['watchlist', 'want'],
  ['reading', 'reading'],
  ['watching', 'reading'],
  ['read', 'read'],
  ['finished', 'read'],
  ['done', 'read'],
  ['watched', 'read']
])
const WATCHED_TYPES = new Set(['movie', 'documentary', 'video'])
const LABELS: Record<'read' | 'watch', Record<Status, string>> = {
  read: { want: 'Want', reading: 'Reading', read: 'Read' },
  watch: { want: 'Watchlist', reading: 'Watching', read: 'Watched' }
}

export function statusLabel(id: Status, type: string | null): string {
  return LABELS[type && WATCHED_TYPES.has(type) ? 'watch' : 'read'][id]
}

export function normalizeStatus(raw: unknown): Status | null {
  if (typeof raw !== 'string') return null
  return STATUS_WORDS.get(raw.trim().toLowerCase().replace(/[\s_]+/g, '-')) ?? null
}

/** Any body words outside headings: the owner wrote something (a Log entry is enough). */
export const hasMyNotes = (note: NoteMeta): boolean => (note.noteWords ?? 0) > 0

/** The section of notes with no collection (only offered when other notes have one). */
export const NO_COLLECTION = 'no collection'

// ---- URL state: ?c=<collection>&cat=<category>&s=want,read&notes=1&q=<search> ----

export interface BrowseState {
  c: string | null
  cat: string | null
  s: Status[]
  notes: boolean
  /** Search text: matches title, subtitle-ish fields (author) and aliases, case-insensitively. */
  q: string
}
export const EMPTY_BROWSE: BrowseState = { c: null, cat: null, s: [], notes: false, q: '' }

export function parseBrowse(search: string): BrowseState {
  const p = new URLSearchParams(search)
  const key = (v: string | null) => (v ? foldKey(v) : '') || null
  const wanted = new Set((p.get('s') ?? '').split(',').map(v => v.trim().toLowerCase()))
  return { c: key(p.get('c')), cat: key(p.get('cat')), s: STATUS_IDS.filter(id => wanted.has(id)), notes: p.get('notes') === '1', q: p.get('q') ?? '' }
}

export function browseSearch(state: BrowseState): string {
  const p = new URLSearchParams()
  if (state.c) p.set('c', state.c)
  if (state.cat) p.set('cat', state.cat)
  const s = STATUS_IDS.filter(id => state.s.includes(id))
  if (s.length) p.set('s', s.join(','))
  if (state.notes) p.set('notes', '1')
  if (state.q.trim()) p.set('q', state.q)
  const q = p.toString().replace(/%2C/gi, ',')
  return q ? `?${q}` : ''
}

// ---- facets and groups ----

export interface StatusChip {
  id: Status
  label: string
  count: number
}

export interface BrowseGroup {
  key: string
  label: string
  notes: NoteMeta[]
}

export interface BrowseResult {
  /** Collections over the whole tab, count desc, then No collection. Empty: no Sections row. */
  sections: Facet[]
  section: string | null
  /** Some note in the tab has a category: show the Subcategories row. */
  hasCategories: boolean
  /** Categories in the section after the status and notes filters; Uncategorized last. */
  subcategories: Facet[]
  category: string | null
  /** Status chips: which ones is fixed by the section, so toggling filters never moves them; counts are after search and Has my notes. */
  statuses: StatusChip[]
  total: number
  /** Notes in the section after the filters (the "All" subcategory count). */
  matching: number
  groups: BrowseGroup[]
  grouped: boolean
  /** What a group's "Show all" selects; null when not grouped. */
  groupedBy: 'collection' | 'category' | null
}

interface Row {
  note: NoteMeta
  cols: string[]
  cats: string[]
}

function groupBy(rows: Row[], first: (r: Row) => string | undefined, order: Facet[], noneKey: string, noneLabel: string): BrowseGroup[] {
  const byKey = new Map<string, NoteMeta[]>()
  for (const r of rows) {
    const v = first(r)
    const k = v ? foldKey(v) : noneKey
    const list = byKey.get(k) ?? []
    list.push(r.note)
    byKey.set(k, list)
  }
  const groups: BrowseGroup[] = []
  for (const f of order) {
    const notes = byKey.get(f.key)
    if (notes && f.key !== noneKey) groups.push({ key: f.key, label: f.label, notes })
  }
  const rest = byKey.get(noneKey)
  if (rest) groups.push({ key: noneKey, label: noneLabel, notes: rest })
  return groups
}

const SEARCHED = ['author', 'authors', 'creator', 'director', 'subtitle', 'isbn'] as const

/** Every word of the query appears in the title, an alias or one of SEARCHED's fields. */
export function matchesSearch(note: NoteMeta, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const fm = note.frontmatter
  const text = [note.title, fm.aliases, ...SEARCHED.map(k => fm[k])]
    .flat()
    .filter(v => typeof v === 'string' || typeof v === 'number')
    .join(' ')
    .toLowerCase()
  return words.every(w => text.includes(w))
}

export function browse(notes: NoteMeta[], state: BrowseState, type: string | null): BrowseResult {
  const root = libraryRoot(type)
  const rows: Row[] = notes.map(note => ({
    note,
    cols: noteCollections(note, root).filter(c => foldKey(c) !== NO_COLLECTION),
    cats: noteCategories(note).filter(c => foldKey(c) !== UNCATEGORIZED)
  }))
  const named = bucket(rows.map(r => r.cols))
  const loose = rows.filter(r => r.cols.length === 0).length
  const sections = named.length && loose ? [...named, { key: NO_COLLECTION, value: '', label: 'No collection', count: loose }] : named
  const section = state.c && sections.some(f => f.key === state.c) ? state.c : null
  const inSection =
    section === NO_COLLECTION ? rows.filter(r => r.cols.length === 0) : section ? rows.filter(r => r.cols.some(c => foldKey(c) === section)) : rows

  const searched = state.q.trim() ? inSection.filter(r => matchesSearch(r.note, state.q)) : inSection
  const noted = state.notes ? searched.filter(r => hasMyNotes(r.note)) : searched
  const statusOf = (r: Row) => normalizeStatus(r.note.frontmatter.status)
  const statuses = STATUS_IDS.filter(id => state.s.includes(id) || inSection.some(r => statusOf(r) === id)).map(id => ({
    id,
    label: statusLabel(id, type),
    count: noted.filter(r => statusOf(r) === id).length
  }))
  const filtered = state.s.length
    ? noted.filter(r => {
        const status = statusOf(r)
        return status !== null && state.s.includes(status)
      })
    : noted

  const none = filtered.filter(r => r.cats.length === 0).length
  const subcategories = [...bucket(filtered.map(r => r.cats)), ...(none ? [{ key: UNCATEGORIZED, value: 'Uncategorized', label: 'Uncategorized', count: none }] : [])]
  const category = state.cat && subcategories.some(f => f.key === state.cat) ? state.cat : null
  const inCategory = (r: Row) => (category === UNCATEGORIZED ? r.cats.length === 0 : r.cats.some(c => foldKey(c) === category))
  const shown = category ? filtered.filter(inCategory) : filtered

  let groups: BrowseGroup[]
  let by: 'collection' | 'category' | null
  if (category) {
    groups = shown.length ? [{ key: category, label: '', notes: shown.map(r => r.note) }] : []
    by = null
  } else if (section || named.length === 0) {
    groups = groupBy(shown, r => r.cats[0], subcategories, UNCATEGORIZED, 'Uncategorized')
    by = 'category'
  } else {
    groups = groupBy(shown, r => r.cols[0], named, NO_COLLECTION, 'No collection')
    by = 'collection'
  }
  const grouped = groups.length > 1

  return {
    sections,
    section,
    hasCategories: rows.some(r => r.cats.length > 0),
    subcategories,
    category,
    statuses,
    total: notes.length,
    matching: filtered.length,
    groups,
    grouped,
    groupedBy: grouped ? by : null
  }
}

// ---- layout: per tab, per device ----

export type BrowseView = 'grid' | 'list'
export type BrowseSize = 's' | 'm' | 'l'
export interface BrowseLayout {
  view: BrowseView
  size: BrowseSize
}
export const DEFAULT_LAYOUT: BrowseLayout = { view: 'grid', size: 'm' }

export function parseLayout(raw: unknown): BrowseLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { view: r.view === 'list' ? 'list' : 'grid', size: r.size === 's' || r.size === 'l' ? r.size : 'm' }
}

// ---- shelves: a grouped view shows the start of each group, then "Show all N" ----

/** About two rows of the grid on a wide screen; a handful of list rows. */
export const SHELF: Record<BrowseView, Record<BrowseSize, number>> = {
  grid: { s: 20, m: 16, l: 10 },
  list: { s: 8, m: 6, l: 4 }
}

export function shelf(group: BrowseGroup, grouped: boolean, layout: BrowseLayout): { notes: NoteMeta[]; hidden: number } {
  const max = SHELF[layout.view][layout.size]
  if (!grouped || group.notes.length <= max) return { notes: group.notes, hidden: 0 }
  return { notes: group.notes.slice(0, max), hidden: group.notes.length - max }
}

/** The state a group's "Show all" button navigates to. */
export function showAll(state: BrowseState, result: BrowseResult, group: BrowseGroup): BrowseState {
  return result.groupedBy === 'collection' ? { ...state, c: group.key, cat: null } : { ...state, c: result.section, cat: group.key }
}

// ---- grid columns ----

const BREAKPOINTS = [
  ['', 0],
  ['sm:', 640],
  ['md:', 768],
  ['lg:', 1024],
  ['xl:', 1280]
] as const
// S is the densest; M and L were S and M before the old L (one to three across) was dropped as too big.
const COLUMNS: Record<BrowseSize, readonly number[]> = { s: [4, 5, 6, 8, 10], m: [3, 4, 5, 6, 8], l: [2, 3, 4, 4, 5] }

// Literal strings so Tailwind's scanner sees every class; a test keeps them in step with COLUMNS.
export const GRID_COLUMNS: Record<BrowseSize, string> = {
  s: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10',
  m: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8',
  l: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'
}

export function gridClasses(size: BrowseSize): string {
  return BREAKPOINTS.map(([prefix], i) => `${prefix}grid-cols-${COLUMNS[size][i]}`).join(' ')
}

export function columnsAt(size: BrowseSize, width: number): number {
  let i = 0
  BREAKPOINTS.forEach(([, min], j) => {
    if (width >= min) i = j
  })
  return COLUMNS[size][i]
}
