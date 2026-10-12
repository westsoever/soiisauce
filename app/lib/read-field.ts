// One field lookup for every life view: a NoteMeta key ("title", "date", …)
// wins, anything else is read from frontmatter. It delegates to Core's
// getField, so tab sorting and life-view grouping read fields the same way.
import { getField } from './query'
import type { NoteMeta } from './types'

export function readField(note: NoteMeta, field: string): unknown {
  return getField(note, field)
}

/** A frontmatter value as display text: strings trimmed, numbers and booleans stringified, lists joined. Empty → null. */
export function asText(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    const parts = value.map(asText).filter((part): part is string => part !== null)
    return parts.length ? parts.join(', ') : null
  }
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}
