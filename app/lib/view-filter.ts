// The New view form and the Filter panel edit a tab's query as rows: one field, any of its values.
// Rows must all match. This converts both ways so the form, the panel and the YAML agree (spec §3).
// Pure and client-safe.
import type { Query, QueryClause, Scalar, SortKey, TabConfig } from './types'

export interface FilterRow {
  /** 'type', 'tag', 'folder', or a frontmatter key. */
  field: string
  values: string[]
}

const toArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const one = (values: string[]): string | string[] => (values.length === 1 ? values[0] : values)
const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '')
const GLOB_CHARS = /[*?{}[\]]/
// The value boxes split on commas, and rows named like these would be read back as the type, tag or folder row.
const ROW_NAMES = new Set(['type', 'tag', 'folder'])

export function rowsToQuery(rows: FilterRow[]): QueryClause {
  const merged = new Map<string, string[]>()
  for (const row of rows) {
    const values = row.values.map(v => v.trim()).filter(Boolean)
    if (!values.length) continue
    const list = merged.get(row.field) ?? []
    for (const v of values) if (!list.includes(v)) list.push(v)
    merged.set(row.field, list)
  }
  const clause: QueryClause = {}
  for (const [field, values] of merged) {
    if (field === 'type') clause.type = one(values)
    else if (field === 'tag') clause.tag = one(values.map(t => t.replace(/^#/, '')))
    else if (field === 'folder') clause.path = one(values.map(f => `${trimSlashes(f)}/**`))
    else (clause.where ??= {})[field] = one(values)
  }
  return clause
}

/** Rows for a query, or null when it can't be shown as rows without losing meaning (OR groups, path globs, commas, clashing keys). */
export function queryToRows(query: Query): FilterRow[] | null {
  const clauses = toArray(query)
  if (clauses.length !== 1) return null
  const clause = clauses[0]
  const rows: FilterRow[] = []
  const hasComma = (values: string[]) => values.some(v => v.includes(','))
  if (clause.type !== undefined) {
    if (hasComma(toArray(clause.type))) return null
    rows.push({ field: 'type', values: toArray(clause.type) })
  }
  if (clause.tag !== undefined) {
    if (hasComma(toArray(clause.tag))) return null
    rows.push({ field: 'tag', values: toArray(clause.tag).map(t => t.replace(/^#/, '')) })
  }
  if (clause.path !== undefined) {
    const folders: string[] = []
    for (const p of toArray(clause.path)) {
      const m = /^(.+)\/\*\*$/.exec(p)
      if (!m || GLOB_CHARS.test(m[1]) || m[1].includes(',')) return null
      folders.push(trimSlashes(m[1]))
    }
    rows.push({ field: 'folder', values: folders })
  }
  for (const [field, wanted] of Object.entries(clause.where ?? {})) {
    const values = toArray<Scalar>(wanted).map(v => String(v))
    if (ROW_NAMES.has(field) || hasComma(values)) return null
    rows.push({ field, values })
  }
  return rows
}

/** The filter in plain words, one line per clause (later clauses start with "Or:"). For a filter the rows can't show. */
export function describeFilter(query: Query): string[] {
  return toArray(query).map((clause, i) => {
    const conditions: string[] = []
    const anyOf = (values: string[]) => values.join(' or ')
    if (clause.type !== undefined) conditions.push(`type is ${anyOf(toArray(clause.type))}`)
    if (clause.tag !== undefined) conditions.push(`tag is ${anyOf(toArray(clause.tag).map(t => `#${t.replace(/^#/, '')}`))}`)
    if (clause.path !== undefined) conditions.push(`in a path matching ${anyOf(toArray(clause.path))}`)
    for (const [field, wanted] of Object.entries(clause.where ?? {})) conditions.push(`${field} is ${anyOf(toArray<Scalar>(wanted).map(String))}`)
    if (!conditions.length) return i === 0 ? 'Every note' : 'Or: every note'
    const sentence = conditions.join(' and ')
    return i === 0 ? `${sentence[0].toUpperCase()}${sentence.slice(1)}` : `Or: ${sentence}`
  })
}

/**
 * The tab as the settings panel previews it: the pending filter and sort laid over the saved ones. An empty sort
 * means the default order (saving it removes the key), so it must not reach runTab as `[]`. Pure.
 */
export function applyPending(tab: TabConfig, pending: { query?: Query; sort?: SortKey[] }): TabConfig {
  const next: TabConfig = { ...tab }
  if (pending.query !== undefined) next.query = pending.query
  if (pending.sort !== undefined) {
    if (pending.sort.length) next.sort = pending.sort
    else delete next.sort
  }
  return next
}
