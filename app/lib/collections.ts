// app/lib/collections.ts
// One field per job (see the library browse design notes): `collection` is the
// list or source a note belongs to (a Library section), `category` its subject (a subcategory).
// Pure and client-safe: the Library toolbar, the Log and Add forms and the server all use it.
import { NEW_NOTE_SPECS } from './new-note'
import type { NoteMeta } from './types'

export const MAX_LIST_ITEMS = 5
export const MAX_LIST_ITEM = 60
export const UNCATEGORIZED = 'uncategorized'

export const LIST_FIELDS = [
  { key: 'collection', label: 'Collection' },
  { key: 'category', label: 'Category' }
] as const
export type ListKey = (typeof LIST_FIELDS)[number]['key']

/** key: folded; value: the most common spelling in the vault; label: value, humanised. */
export interface Facet {
  key: string
  value: string
  label: string
  count: number
}

export function foldKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** ReadingList → "Reading List", self-help_books → "Self help books". Display only. */
export function humanize(value: string): string {
  const spaced = value
    .trim()
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** A frontmatter value as non-empty strings: a string, a number, or a (nested) list of them. */
export function listOf(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value.flat(Infinity) : [value]
  return items
    .map(v => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''))
    .filter(Boolean)
}

/** The folder a Library type's notes are added to, e.g. 04-Resources/Library/Books. */
export function libraryRoot(type: string | null): string | null {
  return type && Object.hasOwn(NEW_NOTE_SPECS, type) ? NEW_NOTE_SPECS[type].folder : null
}

const squash = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '')

/** `collection` → else tags naming a folder below the root (not restating the type) → else the deepest folder below the root. */
export function noteCollections(note: NoteMeta, root: string | null): string[] {
  const own = listOf(note.frontmatter.collection)
  if (own.length) return own
  const under = root !== null && (note.folder === root || note.folder.startsWith(`${root}/`))
  const rel = root !== null && under ? note.folder.slice(root.length) : note.folder
  const folders = rel.split('/').filter(Boolean)
  const byName = new Map(folders.map(f => [squash(f), f]))
  const type = note.type ? squash(note.type) : null
  const restates = (tag: string) => type !== null && (squash(tag) === type || squash(tag) === `${type}s`)
  const fromTags = [...new Set(note.tags.filter(tag => byName.has(squash(tag)) && !restates(tag)).map(tag => byName.get(squash(tag))!))]
  if (fromTags.length) return fromTags
  return under && folders.length ? [folders[folders.length - 1]] : []
}

export function noteCategories(note: NoteMeta): string[] {
  return listOf(note.frontmatter.category)
}

/** Count values case-insensitively (once per note); count desc, then label. */
export function bucket(lists: string[][]): Facet[] {
  const buckets = new Map<string, { count: number; spellings: Map<string, number> }>()
  for (const list of lists) {
    const seen = new Set<string>()
    for (const raw of list) {
      const key = foldKey(raw)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const b = buckets.get(key) ?? { count: 0, spellings: new Map<string, number>() }
      b.count++
      const spelling = raw.replace(/\s+/g, ' ').trim()
      b.spellings.set(spelling, (b.spellings.get(spelling) ?? 0) + 1)
      buckets.set(key, b)
    }
  }
  return [...buckets]
    .map(([key, b]) => {
      const value = [...b.spellings].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0]
      return { key, value, label: humanize(value), count: b.count }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** What the Log and Add forms suggest: the values already used by notes of this type. */
export function facetSuggestions(notes: NoteMeta[], type: string | null, field: ListKey): Facet[] {
  const root = libraryRoot(type)
  const ofType = notes.filter(n => n.type === type)
  return bucket(ofType.map(n => (field === 'collection' ? noteCollections(n, root) : noteCategories(n))))
}

/** "a, b" → ['a', 'b']: trimmed, blanks and case-duplicates dropped, at most 5 items of at most 60 characters. */
export function parseListInput(raw: string, label: string): { ok: true; items: string[] } | { ok: false; message: string } {
  const items: string[] = []
  for (const part of raw.split(',')) {
    const item = part.replace(/\s+/g, ' ').trim()
    if (item && !items.some(i => foldKey(i) === foldKey(item))) items.push(item)
  }
  if (items.length > MAX_LIST_ITEMS) return { ok: false, message: `${label} takes at most ${MAX_LIST_ITEMS} values.` }
  if (items.some(i => i.length > MAX_LIST_ITEM)) return { ok: false, message: `Each ${label.toLowerCase()} is at most ${MAX_LIST_ITEM} characters.` }
  return { ok: true, items }
}
