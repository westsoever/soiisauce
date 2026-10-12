// Board columns for the read-only `board` view (spec §12): known statuses in a
// fixed order, other values alphabetically, then "No <field>" last.
import { parseLooseNumber } from './format'
import { readField } from './read-field'
import type { NoteMeta } from './types'

export const KNOWN_ORDER = ['idea', 'want', 'to-read', 'watchlist', 'active', 'reading', 'done', 'finished', 'read', 'watched', 'dropped', 'abandoned']

export interface BoardOptions {
  groupBy: string
  groups?: string[]
  yearField?: string
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

function valueOf(note: NoteMeta, options: BoardOptions): string | null {
  if (options.groupBy === 'year') return yearOf(note, options.yearField)
  const value = first(readField(note, options.groupBy))
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
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
      head.push(buckets.get(key) ?? { key, label, missing: false, notes: [] })
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

/** `progress` as 0–100, or null when it isn't a number. */
export function progressOf(note: NoteMeta): number | null {
  const value = parseLooseNumber(note.frontmatter.progress)
  if (value === null) return null
  return Math.min(100, Math.max(0, value))
}
