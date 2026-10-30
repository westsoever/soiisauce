// Board columns for the `board` view (spec §12): known statuses in a fixed order,
// other values alphabetically, then "No <field>" last. Also the board's filters and
// what moving a card writes (D126).
import { parseLooseNumber } from './format'
import type { PropertyValue } from './properties'
import { localDay } from './log'
import { asText, readField } from './read-field'
import type { NoteMeta } from './types'

export const KNOWN_ORDER = ['idea', 'want', 'to-read', 'watchlist', 'active', 'reading', 'done', 'finished', 'read', 'watched', 'dropped', 'abandoned']

export interface BoardOptions {
  groupBy: string
  groups?: string[]
  yearField?: string
  /** Column for notes whose value is missing or, with `groups`, not one of them. */
  fallback?: string
}

export interface BoardColumn {
  key: string
  label: string
  missing: boolean
  notes: NoteMeta[]
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function yearFrom(value: unknown): string | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1000 && value <= 9999 ? String(value) : null
  if (typeof value === 'string') return /^\s*(\d{4})(?!\d)/.exec(value)?.[1] ?? null
  return null
}

/** The year a note belongs to: `yearField` (default `year`), then `due`, then the note date. */
export function yearOf(note: NoteMeta, yearField = 'year'): string | null {
  for (const candidate of [readField(note, yearField), note.frontmatter.due, note.date]) {
    const year = yearFrom(first(candidate))
    if (year) return year
  }
  return null
}

function rawValueOf(note: NoteMeta, options: BoardOptions): string | null {
  if (options.groupBy === 'year') return yearOf(note, options.yearField)
  const value = first(readField(note, options.groupBy))
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

/** The column a note shows in: its value, or the fallback for a missing or (with `groups`) unknown one. */
function valueOf(note: NoteMeta, options: BoardOptions): string | null {
  const value = rawValueOf(note, options)
  const fallback = options.fallback?.trim()
  if (!fallback) return value
  if (value === null) return fallback
  if (options.groups?.length && !options.groups.some(g => keyOf(g) === keyOf(value))) return fallback
  return value
}

export function groupNotes(notes: NoteMeta[], options: BoardOptions): BoardColumn[] {
  const buckets = new Map<string, BoardColumn>()
  const missing: BoardColumn = { key: '\u0000missing', label: `No ${options.groupBy}`, missing: true, notes: [] }

  for (const note of notes) {
    const value = valueOf(note, options)
    if (value === null) {
      missing.notes.push(note)
      continue
    }
    const key = value.toLowerCase()
    let column = buckets.get(key)
    if (!column) {
      column = { key, label: value, missing: false, notes: [] }
      buckets.set(key, column)
    }
    column.notes.push(note)
  }

  const head: BoardColumn[] = []
  if (options.groups?.length) {
    const seen = new Set<string>()
    for (const group of options.groups) {
      const label = group.trim()
      const key = label.toLowerCase()
      if (!label || seen.has(key)) continue
      seen.add(key)
      // A listed column is named as the config spells it: that is also what moving a card into it writes.
      head.push({ key, missing: false, notes: [], ...buckets.get(key), label })
      buckets.delete(key)
    }
  } else if (options.groupBy !== 'year') {
    for (const key of KNOWN_ORDER) {
      const column = buckets.get(key)
      if (!column) continue
      head.push(column)
      buckets.delete(key)
    }
  }

  const rest = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key))
  const columns = [...head, ...rest]
  if (missing.notes.length) columns.push(missing)
  return columns
}

/** `progress` as 0–100, or null when it isn't a number. A `progress_day` before today means a daily goal that hasn't
 * been logged today, so it reads 0 until it is. */
export function progressOf(note: NoteMeta, today: string = localDay()): number | null {
  const value = parseLooseNumber(note.frontmatter.progress)
  if (value === null) return null
  const on = asText(note.frontmatter.progress_day) ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(on) && on < today) return 0
  return Math.min(100, Math.max(0, value))
}

// ---- Filters (`options.filters`, `options.flag`) ----

export interface BoardFilter {
  field: string
  /** The name of the "no value" choice, e.g. "Needs triage" for no lane. Also shown as a quick chip. */
  none?: string
}

/** Chosen value per field: absent = any, null = the field is empty. */
export type BoardValues = Record<string, string | null>

export interface BoardFilterState {
  values: BoardValues
  /** Only notes whose flag field has text (e.g. `blocked`). */
  flag: boolean
}

export interface BoardFacet {
  field: string
  noneLabel: string | null
  /** Notes matching the other filters. */
  total: number
  noneCount: number
  values: { key: string; label: string; count: number }[]
}

function keyOf(text: string): string {
  return text.trim().toLowerCase()
}

/** A field's values as display text, one per list item; empty → []. */
function textsOf(note: NoteMeta, field: string): string[] {
  const value = readField(note, field)
  return (Array.isArray(value) ? value : [value]).map(asText).filter((t): t is string => t !== null)
}

export function isFlagged(note: NoteMeta, field: string | undefined): boolean {
  return !!field && textsOf(note, field).length > 0
}

function matchesValues(note: NoteMeta, values: BoardValues, skip?: string): boolean {
  for (const [field, wanted] of Object.entries(values)) {
    if (field === skip) continue
    const texts = textsOf(note, field)
    if (wanted === null ? texts.length > 0 : !texts.some(t => keyOf(t) === keyOf(wanted))) return false
  }
  return true
}

export function filterBoard(notes: NoteMeta[], values: BoardValues, flag: boolean, flagField?: string): NoteMeta[] {
  return notes.filter(n => matchesValues(n, values) && (!flag || isFlagged(n, flagField)))
}

/** Each filter's choices: every value in `notes`, counted under the other filters, so a chosen value never disappears. */
export function boardFacets(
  notes: NoteMeta[],
  filters: BoardFilter[],
  values: BoardValues,
  flag: boolean,
  flagField?: string
): { filters: BoardFacet[]; flagCount: number } {
  const facets = filters.map(({ field, none }): BoardFacet => {
    const labels = new Map<string, string>()
    const counts = new Map<string, number>()
    let total = 0
    let noneCount = 0
    for (const note of notes) {
      const texts = textsOf(note, field)
      for (const text of texts) if (!labels.has(keyOf(text))) labels.set(keyOf(text), text)
      if (!matchesValues(note, values, field) || (flag && !isFlagged(note, flagField))) continue
      total++
      if (texts.length === 0) noneCount++
      for (const key of new Set(texts.map(keyOf))) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const list = [...labels].map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 })).sort((a, b) => a.key.localeCompare(b.key))
    return { field, noneLabel: none ?? null, total, noneCount, values: list }
  })
  const flagCount = flagField ? notes.filter(n => matchesValues(n, values) && isFlagged(n, flagField)).length : 0
  return { filters: facets, flagCount }
}

/** `?lane=&kind=task&blocked=1`: an empty value is "none"; fields that aren't filters are ignored. */
export function parseBoardSearch(search: string, filters: BoardFilter[], flagField?: string): BoardFilterState {
  const params = new URLSearchParams(search)
  const values: BoardValues = {}
  for (const { field } of filters) {
    const value = params.get(field)
    if (value !== null) values[field] = value.trim() === '' ? null : value
  }
  return { values, flag: !!flagField && params.get(flagField) === '1' }
}

export function boardSearch(state: BoardFilterState, filters: BoardFilter[], flagField?: string): string {
  const params = new URLSearchParams()
  for (const { field } of filters) {
    if (Object.hasOwn(state.values, field)) params.set(field, state.values[field] ?? '')
  }
  if (flagField && state.flag) params.set(flagField, '1')
  const text = params.toString()
  return text ? `?${text}` : ''
}

// ---- Moving a card (`options.move`, `options.stamp`) ----

export interface MoveOptions extends BoardOptions {
  /** Column → date field: moving a card in sets the field to today, moving it out clears it. */
  stamp?: Record<string, string>
}

export interface PropertyEdit {
  key: string
  value: PropertyValue
}

function stampFor(stamp: Record<string, string> | undefined, column: string): string | undefined {
  return Object.entries(stamp ?? {}).find(([key]) => keyOf(key) === keyOf(column))?.[1]
}

/** The property writes, in order, that move `note` to the column labelled `to`. [] when it is already there. */
export function moveEdits(note: NoteMeta, to: string, options: MoveOptions, today: string): PropertyEdit[] {
  const from = valueOf(note, options)
  if (from !== null && keyOf(from) === keyOf(to)) return []
  const edits: PropertyEdit[] = [{ key: options.groupBy, value: to }]
  const into = stampFor(options.stamp, to)
  const outOf = from === null ? undefined : stampFor(options.stamp, from)
  if (into) edits.push({ key: into, value: today })
  if (outOf && outOf !== into && textsOf(note, outOf).length > 0) edits.push({ key: outOf, value: null })
  return edits
}

/** The date a card shows in a stamped column (`done` in Done), else null. */
export function stampedDate(note: NoteMeta, column: string, stamp: Record<string, string> | undefined): string | null {
  const field = stampFor(stamp, column)
  return field ? (textsOf(note, field)[0] ?? null) : null
}

// ---- Card links (`options.links`) ----

export type LinkValue =
  | { kind: 'url'; href: string; label: string }
  | { kind: 'note'; target: string; label: string | null }
  | { kind: 'text'; label: string }

const WIKI = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/

/** How a card shows a link field: a URL (`PR #42`), a [[wikilink]] to a note, or plain text (`ABC-16`). */
export function linkValue(value: unknown, label: string): LinkValue | null {
  const one = first(value)
  // Unquoted `result: [[X]]` arrives from YAML as [["X"]].
  if (Array.isArray(one) && one.length === 1 && typeof one[0] === 'string' && one[0].trim()) {
    return { kind: 'note', target: one[0].trim(), label: null }
  }
  const text = asText(one)
  if (text === null || typeof one === 'object') return null
  if (/^https?:\/\//i.test(text)) {
    const number = /\/(?:pull|issues|merge_requests)\/(\d+)\/?(?:[?#].*)?$/.exec(text)?.[1]
    return { kind: 'url', href: text, label: number ? `${label} #${number}` : label }
  }
  const wiki = WIKI.exec(text)
  if (wiki) return { kind: 'note', target: wiki[1].trim(), label: wiki[2]?.trim() || null }
  return { kind: 'text', label: text }
}
