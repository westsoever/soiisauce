// app/lib/query.ts
// The workspace engine (spec §6.2, §9): match notes against a tab's query,
// sort, limit. Runs in the browser over the whole VaultIndex.
import { matchesGlob } from './glob'
import type { NoteMeta, Query, QueryClause, Scalar, SortKey, TabConfig, VaultIndex } from './types'

export const DEFAULT_SORT: SortKey[] = [
  { field: 'date', dir: 'desc' },
  { field: 'title', dir: 'asc' }
]

const META_FIELDS = new Set(['id', 'title', 'path', 'folder', 'type', 'tags', 'date', 'updated', 'excerpt', 'image', 'wordCount', 'noteWords', 'lastSeen'])

/** A NoteMeta field ("title", "date", …) or else a frontmatter field. */
export function getField(note: NoteMeta, field: string): unknown {
  if (META_FIELDS.has(field)) return (note as unknown as Record<string, unknown>)[field]
  // hasOwn: a field called `constructor` or `toString` must not resolve to an Object.prototype member.
  return Object.hasOwn(note.frontmatter, field) ? note.frontmatter[field] : undefined
}

const toArray = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v])

const aliasCache = new WeakMap<Record<string, string[]>, Map<string, string>>()
function aliases(types: Record<string, string[]>): Map<string, string> {
  let map = aliasCache.get(types)
  if (!map) {
    map = new Map()
    for (const [name, values] of Object.entries(types)) {
      // NoteMeta.type is lowercased (spec §6.1), so the canonical name is too.
      const canonical = name.trim().toLowerCase()
      map.set(canonical, canonical)
      for (const v of values) map.set(v.trim().toLowerCase(), canonical)
    }
    aliasCache.set(types, map)
  }
  return map
}

export function canonicalType(value: string, types: Record<string, string[]>): string {
  const key = value.trim().toLowerCase()
  return aliases(types).get(key) ?? key
}

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)$/

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && NUMERIC.test(v.trim())) return Number(v)
  return null
}

function asBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true') return true
    if (s === 'false') return false
  }
  return null
}

/** Frontmatter is loosely typed, so `9.9`, `"9.90"`, `5`, `"5.0"`, `true` and `"true"` are compared by meaning; other strings case-insensitively. */
function equals(actual: unknown, wanted: Scalar): boolean {
  const a = asNumber(actual)
  const w = asNumber(wanted)
  if (a !== null && w !== null) return a === w
  const ab = asBoolean(actual)
  const wb = asBoolean(wanted)
  if (ab !== null && wb !== null) return ab === wb
  if (typeof actual === 'string' && typeof wanted === 'string') return actual.trim().toLowerCase() === wanted.trim().toLowerCase()
  return actual === wanted
}

function fieldMatches(value: unknown, wanted: Scalar | Scalar[]): boolean {
  const values = Array.isArray(value) ? value : [value]
  return values.some(v => toArray(wanted).some(w => equals(v, w)))
}

export function matchesClause(note: NoteMeta, clause: QueryClause, types: Record<string, string[]>): boolean {
  if (clause.type !== undefined) {
    const wanted = toArray(clause.type).map(t => canonicalType(t, types))
    if (!note.type || !wanted.includes(note.type)) return false
  }
  if (clause.path !== undefined && !matchesGlob(note.path, clause.path)) return false
  if (clause.tag !== undefined) {
    const wanted = toArray(clause.tag).map(t => t.replace(/^#/, '').toLowerCase())
    if (!note.tags.some(t => wanted.includes(t))) return false
  }
  for (const [field, wanted] of Object.entries(clause.where ?? {})) {
    if (!fieldMatches(getField(note, field), wanted)) return false
  }
  return true
}

export function matchesQuery(note: NoteMeta, query: Query, types: Record<string, string[]>): boolean {
  return toArray(query).some(clause => matchesClause(note, clause, types))
}

function isMissing(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

function compareValues(a: unknown, b: unknown): number {
  const x = Array.isArray(a) ? a[0] : a
  const y = Array.isArray(b) ? b[0] : b
  if (typeof x === 'number' && typeof y === 'number') return x - y
  return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })
}

export function sortNotes(notes: NoteMeta[], sort: SortKey[]): NoteMeta[] {
  return [...notes].sort((p, q) => {
    for (const key of sort) {
      const a = getField(p, key.field)
      const b = getField(q, key.field)
      const am = isMissing(a)
      const bm = isMissing(b)
      if (am && bm) continue
      if (am) return 1
      if (bm) return -1
      const c = compareValues(a, b)
      if (c !== 0) return key.dir === 'asc' ? c : -c
    }
    return 0
  })
}

export function runTab(tab: TabConfig, index: Pick<VaultIndex, 'notes' | 'config'>): NoteMeta[] {
  const matched = index.notes.filter(n => matchesQuery(n, tab.query, index.config.types))
  const sorted = sortNotes(matched, tab.sort ?? DEFAULT_SORT)
  return tab.limit ? sorted.slice(0, tab.limit) : sorted
}

/** One plain-language sentence per clause, for empty tabs (spec §9). */
export function describeQuery(query: Query): string[] {
  return toArray(query).map(clause => {
    const fields: string[] = []
    if (clause.type !== undefined) fields.push(toArray(clause.type).map(t => `\`type: ${t}\``).join(' or '))
    for (const [k, v] of Object.entries(clause.where ?? {})) fields.push(toArray(v).map(x => `\`${k}: ${x}\``).join(' or '))
    const parts: string[] = []
    if (fields.length) parts.push(`add ${fields.join(' and ')} to a note's frontmatter`)
    if (clause.tag !== undefined) parts.push(`tag it ${toArray(clause.tag).map(t => `\`#${t.replace(/^#/, '')}\``).join(' or ')}`)
    if (clause.path !== undefined) parts.push(`keep it in a path matching ${toArray(clause.path).map(p => `\`${p}\``).join(' or ')}`)
    if (!parts.length) return 'Every note matches this tab.'
    const sentence = parts.join(', and ')
    return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`
  })
}
