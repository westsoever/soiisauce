// app/lib/property-edit.ts
// Set one frontmatter property from the reader (D62). Only the text of that property changes:
// the new value is spliced in where the old one was, so other keys, their formatting, comments
// and the body stay byte for byte (a full YAML re-stringify would turn `zip: 007` into `zip: 7`).
// Server only (imports yaml).
import { Document, isMap, isScalar, isSeq, parseDocument, type Scalar } from 'yaml'
import { FRONT } from './log-edit'
import type { PropertyValue } from './properties'

const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false, nullStr: '' } as const

export type SetPropertyResult = { ok: true; content: string } | { ok: false; reason: 'unreadable' }

function renderValue(value: PropertyValue, quote?: Scalar.Type): string {
  const doc = new Document()
  const node = doc.createNode(value)
  if (quote && isScalar(node) && typeof value === 'string') node.type = quote
  doc.contents = node
  return doc.toString(STRINGIFY).replace(/\n$/, '')
}

function renderPair(key: string, value: PropertyValue, flow = false): string {
  const doc = new Document()
  const map = doc.createNode({ [key]: value })
  const node = map.items[0]?.value
  if (isSeq(node)) node.flow = flow
  doc.contents = map
  return doc.toString(STRINGIFY).replace(/\n$/, '')
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Set `key` in the YAML text between the fences; null if the YAML can't be read safely. */
function setInYaml(inner: string, key: string, value: PropertyValue): string | null {
  const doc = parseDocument(inner)
  if (doc.errors.length || (doc.contents !== null && !isMap(doc.contents))) return null
  const pair = (isMap(doc.contents) ? doc.contents.items : []).find(p => isScalar(p.key) && String(p.key.value) === key)
  if (!pair) {
    const base = inner === '' || inner.endsWith('\n') ? inner : `${inner}\n`
    return `${base}${renderPair(key, value)}\n`
  }
  const k = pair.key as Scalar
  const v = pair.value
  const keepNewline = (region: string, text: string) => (region.endsWith('\n') && !text.endsWith('\n') ? `${text}\n` : text)

  // Scalar → scalar: replace just the value, so the key, the spacing and a trailing comment stay.
  if (!Array.isArray(value) && isScalar(v) && v.range) {
    const quote = typeof v.value === 'string' && (v.type === 'QUOTE_DOUBLE' || v.type === 'QUOTE_SINGLE') ? v.type : undefined
    let [start, end] = v.range
    let text = renderValue(value, quote)
    if (text === '') while (start > 0 && (inner[start - 1] === ' ' || inner[start - 1] === '\t')) start--
    else if (start === end && inner[start - 1] === ':') text = ` ${text}`
    return inner.slice(0, start) + keepNewline(inner.slice(start, end), text) + inner.slice(end)
  }

  // Anything involving a list (or an old map): rewrite the whole pair. A flow list stays a flow list
  // and keeps its trailing comment; a block list is written as one, like the Library's notes.
  const flow = Array.isArray(value) && isSeq(v) && Boolean(v.flow)
  const start = k.range?.[0] ?? 0
  const end = v && 'range' in v && v.range ? (flow ? v.range[1] : v.range[2]) : (k.range?.[2] ?? start)
  return inner.slice(0, start) + keepNewline(inner.slice(start, end), renderPair(key, value, flow)) + inner.slice(end)
}

export function setProperty(source: string, key: string, value: PropertyValue, opts: { updated?: string } = {}): SetPropertyResult {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const text = source.replace(/\r\n/g, '\n')
  const m = FRONT.exec(text)
  const bom = text.startsWith('﻿') ? '﻿' : ''
  const inner = m ? m[0].replace(/^﻿?---[ \t]*\n/, '').replace(/---[ \t]*\n?$/, '') : ''
  const close = m ? (/---[ \t]*\n?$/.exec(m[0])?.[0] ?? '---\n') : '---\n'
  const rest = m ? text.slice(m[0].length) : text.slice(bom.length)

  let next = setInYaml(inner, key, value)
  if (next !== null && opts.updated && key !== 'updated') {
    const doc = parseDocument(next)
    if (doc.has('updated')) next = setInYaml(next, 'updated', opts.updated)
  }
  if (next === null) return { ok: false, reason: 'unreadable' }

  // Read it back: the value must be exactly what was asked for, and the YAML still valid.
  const check = parseDocument(next)
  if (check.errors.length || !sameValue((check.toJS() as Record<string, unknown> | null)?.[key], value)) return { ok: false, reason: 'unreadable' }

  const closing = close.endsWith('\n') || rest === '' ? close : `${close}\n`
  return { ok: true, content: `${bom}---\n${next}${closing}${rest}`.replace(/\n/g, eol) }
}
