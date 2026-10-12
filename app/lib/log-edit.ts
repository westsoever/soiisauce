// app/lib/log-edit.ts
// Changing an existing note for the Log: add a dated bullet at the end of a `## ` section, and
// change a few frontmatter values without reformatting the rest. Server only (imports yaml).
// Both keep the file's line endings, and neither touches anything outside what they change.
import { Document, isMap, isScalar, parseDocument } from 'yaml'

// The frontmatter block at the very top: `---`, optional YAML, `---`. A BOM may come first.
export const FRONT = /^﻿?---[ \t]*\n(?:[\s\S]*?\n)?---[ \t]*(?:\n|$)/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/

interface HeadingLine {
  index: number
  level: number
  text: string
}

// ATX headings at column 0, outside code fences. Continuation lines of a log entry are indented,
// so a `## Log` someone typed into an entry never counts.
function headingLines(lines: string[]): HeadingLine[] {
  const out: HeadingLine[] = []
  let fence: string | null = null
  lines.forEach((line, index) => {
    const f = FENCE.exec(line)
    if (f) {
      if (fence === null) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      return
    }
    if (fence !== null) return
    const h = HEADING.exec(line)
    if (h) out.push({ index, level: h[1].length, text: h[2] })
  })
  return out
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function appendEntry(source: string, section: string, entry: string, opts: { before?: string[] } = {}): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const text = source.replace(/\r\n/g, '\n')
  const m = FRONT.exec(text)
  let head = m ? m[0] : ''
  if (head && !head.endsWith('\n')) head += '\n'
  const lines = text.slice(m ? m[0].length : 0).split('\n')
  if (lines.at(-1) === '') lines.pop()
  const headings = headingLines(lines)
  const entryLines = entry.split('\n')
  const target = headings.find(h => h.level === 2 && same(h.text, section))

  if (target) {
    const next = headings.find(h => h.index > target.index && h.level <= 2)
    let at = next ? next.index : lines.length
    while (at - 1 > target.index && lines[at - 1].trim() === '') at--
    const insert = at === target.index + 1 ? ['', ...entryLines] : entryLines
    lines.splice(at, 0, ...insert)
    const after = at + insert.length
    if (after < lines.length && lines[after].trim() !== '') lines.splice(after, 0, '')
  } else {
    const tail = headings.find(h => h.level === 2 && (opts.before ?? []).some(b => same(b, h.text)))
    if (tail) {
      const block = [`## ${section}`, '', ...entryLines, '']
      if (tail.index > 0 && lines[tail.index - 1].trim() !== '') block.unshift('')
      lines.splice(tail.index, 0, ...block)
    } else {
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
      lines.push(...(lines.length ? [''] : []), `## ${section}`, '', ...entryLines)
    }
  }
  return `${head}${lines.join('\n')}\n`.replace(/\n/g, eol)
}

const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false } as const

export function patchFrontmatter(
  source: string,
  changes: Record<string, string | number | string[]>,
  opts: { updated?: string } = {}
): { content: string; warning: string | null } {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const text = source.replace(/\r\n/g, '\n')
  const m = FRONT.exec(text)
  if (!m) {
    const yaml = new Document(changes).toString(STRINGIFY)
    return { content: `---\n${yaml}---\n${text}`.replace(/\n/g, eol), warning: null }
  }
  const bom = text.startsWith('﻿') ? '﻿' : ''
  const inner = m[0].replace(/^﻿?---[ \t]*\n/, '').replace(/---[ \t]*\n?$/, '')
  const doc = parseDocument(inner)
  if (doc.errors.length || (doc.contents !== null && !isMap(doc.contents))) {
    return { content: source, warning: "Couldn't read this note's frontmatter, so its fields weren't changed." }
  }
  // Update scalars in place so their comments and quoting survive.
  // Lists (collection, category) are written as block lists, the Library's style.
  const set = (key: string, value: string | number | string[]) => {
    if (Array.isArray(value)) return void doc.set(key, doc.createNode(value))
    const node = doc.get(key, true)
    if (isScalar(node)) node.value = value
    else doc.set(key, value)
  }
  for (const [key, value] of Object.entries(changes)) set(key, value)
  if (opts.updated && doc.has('updated')) set('updated', opts.updated)
  const yaml = doc.toString(STRINGIFY)
  return { content: `${bom}---\n${yaml}---\n${text.slice(m[0].length)}`.replace(/\n/g, eol), warning: null }
}
