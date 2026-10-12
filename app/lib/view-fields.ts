// Which types, tags, folders and properties the vault uses, with their values and counts, so the
// New view form and `soii view fields` can offer real values in the vault's own spelling. Pure.
import { foldKey, type Facet } from './collections'
import { getField } from './query'
import type { NoteMeta } from './types'

export interface FieldFacet {
  field: string
  count: number
  values: Facet[]
}

const HIDDEN_FIELDS = new Set(['type', 'tags', 'tag', 'title'])
const isScalar = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

function valuesOf(note: NoteMeta, field: string): string[] {
  const raw = field === 'type' ? note.type : field === 'tag' ? note.tags : field === 'folder' ? note.folder : getField(note, field)
  const list = Array.isArray(raw) ? raw : [raw]
  return list.filter(isScalar).map(v => String(v).trim()).filter(Boolean)
}

/** One Facet per distinct value (case-folded), counted once per note, most common first. */
export function fieldValues(notes: NoteMeta[], field: string): Facet[] {
  const buckets = new Map<string, { count: number; spellings: Map<string, number> }>()
  for (const note of notes) {
    const seen = new Set<string>()
    for (const value of valuesOf(note, field)) {
      const key = foldKey(value)
      const b = buckets.get(key) ?? { count: 0, spellings: new Map() }
      if (!seen.has(key)) b.count++
      seen.add(key)
      b.spellings.set(value, (b.spellings.get(value) ?? 0) + 1)
      buckets.set(key, b)
    }
  }
  return [...buckets]
    .map(([key, b]) => {
      // Most used spelling; on a tie the first one seen (sort is stable, Maps keep insertion order).
      const value = [...b.spellings].sort((x, y) => y[1] - x[1])[0][0]
      return { key, value, label: value, count: b.count }
    })
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export function vaultFields(notes: NoteMeta[]): { types: Facet[]; tags: Facet[]; folders: Facet[]; fields: FieldFacet[] } {
  const keys = new Set<string>()
  for (const n of notes) for (const k of Object.keys(n.frontmatter ?? {})) if (!HIDDEN_FIELDS.has(k)) keys.add(k)
  const fields = [...keys]
    .map(field => {
      const values = fieldValues(notes, field)
      const count = notes.filter(n => valuesOf(n, field).length > 0).length
      return { field, count, values: values.slice(0, 10) }
    })
    .filter(f => f.count > 0)
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field))
  return { types: fieldValues(notes, 'type'), tags: fieldValues(notes, 'tag'), folders: fieldValues(notes, 'folder'), fields }
}
