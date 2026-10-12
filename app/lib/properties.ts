// app/lib/properties.ts
// Which frontmatter properties soii lets you edit from the reader, and what a value may be.
// Shared by the Properties panel (which editor to show) and POST /api/notes/properties.
import { numberValue } from './log'
import type { NoteMeta } from './types'

/** Never shown in the Properties panel and never editable: soii, Obsidian and the title own these. */
export const PROTECTED_PROPERTIES = new Set(['title', 'tags', 'soii', 'publish', 'aliases', 'cssclasses'])

export const MAX_PROPERTY_VALUE = 500
const MAX_LIST_ITEMS = 100
const MAX_LIST_ITEM = 200
// Letters, digits, `_`, then also spaces, `.` and `-`. No `:` `#` `[` or quotes, so a key never needs YAML escaping.
const KEY = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_ .-]{0,62}[\p{L}\p{N}_.-])?$/u
const RESERVED = new Set(['__proto__', 'constructor', 'prototype'])

export type PropertyScalar = string | number | boolean
export type PropertyValue = PropertyScalar | (string | number)[] | null
export type PropertyEditor = 'text' | 'date' | 'number' | 'boolean' | 'list'

export function isEditableKey(key: unknown): key is string {
  return typeof key === 'string' && KEY.test(key) && !RESERVED.has(key) && !PROTECTED_PROPERTIES.has(key.toLowerCase())
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

// For an empty value, the name says what goes in it (the same date fields the table views format).
export const DATE_KEYS = new Set(['date', 'updated', 'created', 'started', 'finished', 'watched', 'renews', 'due', 'last_contact', 'birthday', 'as_of', 'published'])
export const NUMBER_KEYS = new Set(['rating', 'amount', 'pages', 'year'])

/** The editor for a value as it is now; null = soii shows it but can't edit it (nested lists, maps). */
export function editorFor(value: unknown, key?: string): PropertyEditor | null {
  if (value === null || value === undefined || value === '') {
    if (key && DATE_KEYS.has(key)) return 'date'
    if (key && NUMBER_KEYS.has(key)) return 'number'
    return 'text'
  }
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return DAY.test(value.trim()) ? 'date' : 'text'
  if (Array.isArray(value)) return value.every(v => typeof v === 'string' || typeof v === 'number') ? 'list' : null
  return null
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Normalise a value from the browser. Empty text or an empty list clears the value (a bare `key:`). */
export function cleanPropertyValue(raw: unknown): { ok: true; value: PropertyValue } | { ok: false; message: string } {
  if (raw === null) return { ok: true, value: null }
  if (typeof raw === 'boolean') return { ok: true, value: raw }
  if (typeof raw === 'number') return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, message: 'That is not a number.' }
  if (typeof raw === 'string') {
    if (raw.length > MAX_PROPERTY_VALUE) return { ok: false, message: 'That value is too long.' }
    const text = oneLine(raw)
    return { ok: true, value: text || null }
  }
  if (Array.isArray(raw)) {
    if (raw.length > MAX_LIST_ITEMS) return { ok: false, message: 'That list is too long.' }
    const items: (string | number)[] = []
    for (const item of raw) {
      if (typeof item === 'number' && Number.isFinite(item)) items.push(item)
      else if (typeof item === 'string' && item.length <= MAX_LIST_ITEM) {
        const text = oneLine(item)
        if (text) items.push(text)
      } else return { ok: false, message: 'A list holds short text or numbers.' }
    }
    return { ok: true, value: items.length ? items : null }
  }
  return { ok: false, message: 'soii can only set text, numbers, yes/no and lists.' }
}

/** What an editor holds while you type. `text` is also the half-typed item of a list. */
export interface PropertyDraft {
  editor: PropertyEditor
  text: string
  items: string[]
  checked: boolean
}

export function draftFor(value: unknown, editor: PropertyEditor | null = null, key?: string): PropertyDraft | null {
  editor ??= editorFor(value, key)
  if (editor === null) return null
  const draft: PropertyDraft = { editor, text: '', items: [], checked: false }
  if (editor === 'boolean') draft.checked = value === true
  else if (editor === 'list') draft.items = Array.isArray(value) ? value.map(String) : []
  else if (value !== null && value !== undefined && typeof value !== 'object') draft.text = String(value)
  return draft
}

export function valueFromDraft(draft: PropertyDraft): { ok: true; value: PropertyValue } | { ok: false; message: string } {
  const text = draft.text.trim()
  switch (draft.editor) {
    case 'boolean':
      return { ok: true, value: draft.checked }
    case 'list': {
      const items = [...draft.items, text].map(s => s.trim()).filter(Boolean)
      return { ok: true, value: items.length ? items : null }
    }
    case 'number': {
      if (!text) return { ok: true, value: null }
      const n = numberValue(text)
      return n === null ? { ok: false, message: 'That is not a number.' } : { ok: true, value: n }
    }
    case 'date':
      if (text && !DAY.test(text)) return { ok: false, message: 'Pick a date.' }
      return { ok: true, value: text || null }
    default:
      return { ok: true, value: text || null }
  }
}

/** Keys other notes of the same type use and this one lacks, most used first: what "Add property" offers. */
export function suggestKeys(note: NoteMeta, notes: NoteMeta[]): string[] {
  const counts = new Map<string, number>()
  for (const other of notes) {
    if (other.path === note.path || other.type !== note.type) continue
    for (const key of Object.keys(other.frontmatter ?? {})) {
      if (Object.hasOwn(note.frontmatter, key) || !isEditableKey(key)) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key]) => key)
}
