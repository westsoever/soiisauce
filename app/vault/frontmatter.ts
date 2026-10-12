// app/vault/frontmatter.ts
// Splits the YAML block off a note, parses it (malformed YAML never throws),
// and derives the NoteMeta fields that come from it (spec §7.2).
import { parseDocument } from 'yaml'
import { canonicalType } from '../lib/query'
import type { Frontmatter } from '../lib/types'

const EMPTY_FENCE = /^---[ \t]*\r?\n---[ \t]*(?:\r?\n|$)/
const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function splitFrontmatter(source: string): { yaml: string | null; body: string } {
  const text = source.replace(/^﻿/, '')
  const empty = EMPTY_FENCE.exec(text)
  if (empty) return { yaml: '', body: text.slice(empty[0].length) }
  const m = FENCE.exec(text)
  if (!m) return { yaml: null, body: text }
  return { yaml: m[1], body: text.slice(m[0].length) }
}

// A note is hidden by `soii: hidden` or `publish: false` (spec §7.1). Both detection paths
// below accept the same forms, compared case-insensitively with quotes allowed:
// soii: hidden | Hidden | "hidden" and publish: false | False | FALSE | "false" | 'false' | no.
const hiddenWord = (v: unknown, words: string[]) => typeof v === 'string' && words.includes(v.trim().toLowerCase())

/** The parsed-YAML check: `soii` and `publish` as the YAML parser read them. */
export function isHiddenFlag(soii: unknown, publish: unknown): boolean {
  return hiddenWord(soii, ['hidden']) || publish === false || hiddenWord(publish, ['false', 'no'])
}

// The same flags as top-level lines of YAML that failed to parse, so a hidden note with
// a typo in its frontmatter still fails closed. Quotes are optional on either side.
const HIDDEN_LINE = /^(?:soii:[ \t]*['"]?hidden['"]?|publish:[ \t]*['"]?(?:false|no)['"]?)[ \t]*(?:#.*)?$/im

export function isHiddenYaml(yaml: string): boolean {
  return HIDDEN_LINE.test(yaml)
}

export function normalizeValue(v: unknown): unknown {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    const iso = v.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  if (Array.isArray(v)) return v.map(normalizeValue)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizeValue(x)]))
  return v
}

export function parseFrontmatter(source: string): { data: Frontmatter; body: string; error: string | null } {
  const { yaml, body } = splitFrontmatter(source)
  if (yaml === null || yaml.trim() === '') return { data: {}, body, error: null }
  const doc = parseDocument(yaml)
  if (doc.errors.length) {
    const line = doc.errors[0].linePos?.[0]?.line
    // +1: the YAML starts on the file's second line, after the opening ---.
    return { data: {}, body, error: `frontmatter is not valid YAML${line ? ` (line ${line + 1})` : ''}` }
  }
  const value = doc.toJS()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { data: {}, body, error: 'frontmatter is not a key/value map' }
  }
  return { data: normalizeValue(value) as Frontmatter, body, error: null }
}

export function toDateString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^\d{4}-\d{2}-\d{2}/.exec(v.trim())
  return m ? m[0] : null
}

export function frontmatterTags(v: unknown): string[] {
  const raw = typeof v === 'string' ? v.split(/[,\s]+/) : Array.isArray(v) ? v.flat(Infinity).map(String) : []
  return raw.map(t => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean)
}

export interface DerivedFields {
  title: string | null
  type: string | null
  tags: string[]
  date: string | null
  updated: string | null
  hidden: boolean
}

export function deriveFields(data: Frontmatter, path: string, types: Record<string, string[]>): DerivedFields {
  const rawTitle = data.title
  const title =
    typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : typeof rawTitle === 'number' ? String(rawTitle) : null
  const rawType = Array.isArray(data.type) ? data.type[0] : data.type
  const type = typeof rawType === 'string' && rawType.trim() ? canonicalType(rawType, types) : null
  const fileDate = /\d{4}-\d{2}-\d{2}/.exec(path.split('/').pop() ?? '')
  return {
    title,
    type,
    tags: frontmatterTags(data.tags),
    date: toDateString(data.date) ?? toDateString(data.created) ?? (fileDate ? fileDate[0] : null),
    updated: toDateString(data.updated) ?? toDateString(data.modified),
    hidden: isHiddenFlag(data.soii, data.publish)
  }
}
