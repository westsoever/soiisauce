// app/lib/view-edit.ts
// The only code that changes soii.config.yml for views (spec §3, D101). It splices text at node positions
// from parseDocument (like property-edit.ts), so every line it doesn't change stays byte for byte: comments,
// order and the owner's spacing. It refuses a config that doesn't load, copies a built-in workspace whole
// before changing it (a config workspace with a built-in id replaces the built-in), and checks every result
// with resolveConfig() plus a read-back of the tab it wrote. Pure: text in, text out.
import { isMap, isScalar, isSeq, parse, parseDocument, stringify, type Document, type Node, type YAMLMap, type YAMLSeq } from 'yaml'
import { ConfigError } from './config-schema'
import { DEFAULT_CONFIG } from './default-config'
import { resolveConfig } from './merge-config'
import type { Query, SoiiConfig, SortKey, TabConfig } from './types'

export type TabDraft = Omit<TabConfig, 'id'> & { id?: string }
export type EditOk = { ok: true; yaml: string; tabId: string; title: string }
export type EditFail = { ok: false; status: 400 | 409; error: string; message: string }
export type EditResult = EditOk | EditFail

const fail = (status: 400 | 409, error: string, message: string): EditFail => ({ ok: false, status, error, message })
const UNSUPPORTED = (what: string) => fail(400, 'unsupported_format', `soii can't edit ${what} written on one line. Write it as a list (one "- " per line), or edit it by hand.`)

export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'view'
}

// ---- writing YAML in the house style ----

// Characters that can't sit in a plain scalar inside { } or [ ], or that would change its meaning.
const PLAIN_UNSAFE = /[,[\]{}#&*!|>'"%@`]|: |^[-?:\s]|\s$|^$/
function scalar(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v === null || v === undefined) return 'null'
  const s = String(v)
  // yaml quotes what would read back as another type ("true", "5", "null"); flow context needs more.
  return stringify(s, { lineWidth: 0 }).trimEnd() === s && !PLAIN_UNSAFE.test(s) ? s : JSON.stringify(s)
}

/** One-line YAML: `{ a: b }` padded, `[a, b]` not, the way soii's docs and configs write them. */
export function flow(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(flow).join(', ')}]`
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined)
    return entries.length ? `{ ${entries.map(([k, x]) => `${scalar(k)}: ${flow(x)}`).join(', ')} }` : '{}'
  }
  return scalar(v)
}

/** `key: value` lines of a block map. A workspace's `tabs` become a block list of block maps. */
function blockLines(obj: Record<string, unknown>): string[] {
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    if (k === 'tabs' && Array.isArray(v)) {
      lines.push('tabs:')
      for (const tab of v) blockLines(tab as Record<string, unknown>).forEach((l, i) => lines.push(`${i === 0 ? '  - ' : '    '}${l}`))
    } else lines.push(`${scalar(k)}: ${flow(v)}`)
  }
  return lines
}

const itemText = (lines: string[], dash: number) => lines.map((l, i) => `${' '.repeat(dash)}${i === 0 ? '- ' : '  '}${l}`).join('\n')

// ---- positions ----

const lineStart = (t: string, pos: number) => t.lastIndexOf('\n', pos - 1) + 1
const lineEnd = (t: string, pos: number) => {
  const i = t.indexOf('\n', Math.max(0, pos))
  return i < 0 ? t.length : i
}
const rangeOf = (n: unknown) => (n as Node).range as [number, number, number]
/** Column of the "-" that starts a block-list item. */
const dashColumn = (t: string, item: unknown) => {
  const start = rangeOf(item)[0]
  return t.slice(lineStart(t, start), start).lastIndexOf('-')
}

function appendItem(t: string, seq: YAMLSeq, lines: string[]): string {
  const last = seq.items.at(-1)
  const at = lineEnd(t, rangeOf(last)[1] - 1)
  return `${t.slice(0, at)}\n${itemText(lines, dashColumn(t, last))}${t.slice(at)}`
}

function removeItem(t: string, seq: YAMLSeq, i: number): string {
  const item = seq.items[i]
  let start = lineStart(t, rangeOf(item)[0])
  const dash = dashColumn(t, item)
  // Comment lines right above an item belong to it, unless they're indented deeper than its dash: those are
  // a commented-out key of the item above.
  while (start > 0) {
    const prev = lineStart(t, start - 1)
    const line = t.slice(prev, start - 1)
    if (!/^\s*#/.test(line) || line.length - line.trimStart().length > dash) break
    start = prev
  }
  const next = seq.items[i + 1]
  let end: number
  if (next) {
    // Stop before the blank and comment lines that lead into the next item.
    end = lineStart(t, rangeOf(next)[0])
    while (end > start) {
      const prev = lineStart(t, end - 1)
      if (!/^\s*(#.*)?$/.test(t.slice(prev, end - 1))) break
      end = prev
    }
  } else end = Math.min(t.length, lineEnd(t, rangeOf(item)[1] - 1) + 1)
  return t.slice(0, start) + t.slice(end)
}

/** Set (or with `undefined`, delete) one key of a tab. A one-line tab `- { … }` is rewritten as a block. */
function setKey(t: string, item: YAMLMap, key: string, value: unknown): string {
  const [start, valueEnd] = rangeOf(item)
  if (item.flow) {
    const obj = item.toJSON() as Record<string, unknown>
    if (value === undefined) delete obj[key]
    else obj[key] = value
    const indent = ' '.repeat(dashColumn(t, item) + 2)
    return t.slice(0, start) + blockLines(obj).map((l, i) => (i === 0 ? l : `${indent}${l}`)).join('\n') + t.slice(valueEnd)
  }
  const pair = item.items.find(p => isScalar(p.key) && p.key.value === key)
  if (pair) {
    const from = rangeOf(pair.key)[0]
    let to = pair.value ? rangeOf(pair.value)[1] : rangeOf(pair.key)[1]
    // A block value's range ends after its last line break (and any blank lines): stop at the last character.
    while (to > from && /\s/.test(t[to - 1])) to--
    if (value === undefined) return t.slice(0, lineStart(t, from)) + t.slice(Math.min(t.length, lineEnd(t, to - 1) + 1))
    return `${t.slice(0, from)}${key}: ${flow(value)}${t.slice(to)}`
  }
  if (value === undefined) return t
  const lastPair = item.items.at(-1)!
  const at = lineEnd(t, rangeOf(lastPair.value ?? lastPair.key)[1] - 1)
  const indent = ' '.repeat(start - lineStart(t, start))
  return `${t.slice(0, at)}\n${indent}${key}: ${flow(value)}${t.slice(at)}`
}

// ---- loading and finding ----

function firstIssue(err: unknown): string {
  if (err instanceof ConfigError) return err.issues[0] ?? err.message
  return err instanceof Error ? err.message : String(err)
}

function load(text: string): { ok: true; doc: Document } | EditFail {
  const doc = parseDocument(text)
  if (doc.errors.length) return fail(400, 'bad_config', `Fix soii.config.yml first: not valid YAML: ${doc.errors[0].message.split('\n')[0]}`)
  try {
    resolveConfig(doc.toJS() ?? {})
  } catch (err) {
    return fail(400, 'bad_config', `Fix soii.config.yml first: ${firstIssue(err)}`)
  }
  if (doc.contents !== null && !isMap(doc.contents)) return fail(400, 'bad_config', 'Fix soii.config.yml first: it must be a list of settings (key: value).')
  return { ok: true, doc }
}

function workspaceIn(doc: Document, id: string): YAMLMap | undefined {
  const seq = doc.get('workspaces', true)
  return isSeq(seq) ? (seq.items.find(i => isMap(i) && i.get('id') === id) as YAMLMap | undefined) : undefined
}

/** The workspace's map node, after copying a built-in one into the text if needed. */
function ensureWorkspace(text: string, workspaceId: string, defaults: SoiiConfig): { ok: true; text: string; doc: Document; ws: YAMLMap } | EditFail {
  const loaded = load(text)
  if (!loaded.ok) return loaded
  const found = workspaceIn(loaded.doc, workspaceId)
  if (found) return { ok: true, text, doc: loaded.doc, ws: found }
  const builtIn = loaded.doc.get('replaceDefaultWorkspaces') === true ? undefined : defaults.workspaces.find(w => w.id === workspaceId)
  if (!builtIn) return fail(400, 'unknown_workspace', `No workspace "${workspaceId}". Views can only be added to a workspace you already have.`)
  const lines = blockLines(structuredClone(builtIn) as unknown as Record<string, unknown>)
  const seq = loaded.doc.get('workspaces', true)
  let next: string
  if (isSeq(seq) && seq.flow) return UNSUPPORTED('a workspaces list')
  if (isSeq(seq) && seq.items.length) next = appendItem(text, seq, lines)
  else if (loaded.doc.has('workspaces')) {
    // `workspaces:` with nothing under it.
    const key = (loaded.doc.contents as YAMLMap).items.find(p => isScalar(p.key) && p.key.value === 'workspaces')!.key
    const at = lineEnd(text, rangeOf(key)[1])
    next = `${text.slice(0, at)}\n${itemText(lines, 2)}${text.slice(at)}`
  } else next = `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}workspaces:\n${itemText(lines, 2)}\n`
  const doc = parseDocument(next)
  const ws = workspaceIn(doc, workspaceId)
  if (!ws) return fail(400, 'bad_config', 'Fix soii.config.yml first: soii could not find where to add the workspace.')
  return { ok: true, text: next, doc, ws }
}

function tabsOf(ws: YAMLMap): YAMLSeq | EditFail {
  const tabs = ws.get('tabs', true)
  if (!isSeq(tabs)) return fail(400, 'bad_config', 'Fix soii.config.yml first: a workspace needs a tabs list.')
  if (tabs.flow) return UNSUPPORTED('a tabs list')
  return tabs
}

// Key order doesn't matter for "is this what we meant to write".
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v

/** Load the result, and check the tab reads back as intended (`expected`) or is gone (`null`). */
function finish(text: string, workspaceId: string, tabId: string, title: string, expected: TabConfig | null): EditResult {
  let config: SoiiConfig
  try {
    config = resolveConfig(parse(text) ?? {})
  } catch (err) {
    return fail(400, 'invalid_view', err instanceof ConfigError ? err.issues.join('\n') : firstIssue(err))
  }
  const tab = config.workspaces.find(w => w.id === workspaceId)?.tabs.find(t => t.id === tabId) ?? null
  if (JSON.stringify(canonical(tab)) !== JSON.stringify(canonical(expected))) {
    return fail(400, 'invalid_view', 'soii could not write that view safely, so nothing was changed. Edit soii.config.yml by hand, or report this.')
  }
  return { ok: true, yaml: text, tabId, title }
}

function findTab(seq: YAMLSeq, workspaceId: string, tabId: string): { ok: true; i: number; tab: YAMLMap } | EditFail {
  const i = seq.items.findIndex(t => isMap(t) && t.get('id') === tabId)
  if (i < 0) return fail(400, 'unknown_tab', `No view "${tabId}" in ${workspaceId}.`)
  return { ok: true, i, tab: seq.items[i] as YAMLMap }
}

// ---- the four edits ----

export function addTab(yamlText: string | null, workspaceId: string, tab: TabDraft, defaults: SoiiConfig = DEFAULT_CONFIG): EditResult {
  const ws = ensureWorkspace(yamlText ?? '', workspaceId, defaults)
  if (!ws.ok) return ws
  const seq = tabsOf(ws.ws)
  if ('ok' in seq) return seq
  const ids = seq.items.map(t => (isMap(t) ? String(t.get('id')) : ''))
  let id = tab.id
  if (id !== undefined) {
    if (ids.includes(id)) return fail(409, 'tab_exists', `A view with id "${id}" already exists in ${workspaceId}.`)
  } else {
    const base = slugify(tab.title)
    id = base
    for (let n = 2; ids.includes(id); n++) id = `${base}-${n}`
  }
  const { title, icon, view, query, sort, limit, options } = tab
  const value: TabConfig = {
    id,
    title,
    ...(icon !== undefined ? { icon } : {}),
    view,
    query,
    ...(sort !== undefined ? { sort } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(options !== undefined ? { options } : {})
  }
  return finish(appendItem(ws.text, seq, blockLines(value as unknown as Record<string, unknown>)), workspaceId, id, title, value)
}

export function removeTab(yamlText: string | null, workspaceId: string, tabId: string, defaults: SoiiConfig = DEFAULT_CONFIG): EditResult {
  const ws = ensureWorkspace(yamlText ?? '', workspaceId, defaults)
  if (!ws.ok) return ws
  const seq = tabsOf(ws.ws)
  if ('ok' in seq) return seq
  const found = findTab(seq, workspaceId, tabId)
  if (!found.ok) return found
  if (seq.items.length === 1) return fail(409, 'last_tab', `${String(ws.ws.get('title') ?? workspaceId)} needs at least one view.`)
  return finish(removeItem(ws.text, seq, found.i), workspaceId, tabId, String(found.tab.get('title') ?? tabId), null)
}

function setTabKey(yamlText: string | null, workspaceId: string, tabId: string, key: 'query' | 'sort', value: unknown, defaults: SoiiConfig): EditResult {
  const ws = ensureWorkspace(yamlText ?? '', workspaceId, defaults)
  if (!ws.ok) return ws
  const seq = tabsOf(ws.ws)
  if ('ok' in seq) return seq
  const found = findTab(seq, workspaceId, tabId)
  if (!found.ok) return found
  const expected = { ...(found.tab.toJSON() as TabConfig) }
  if (value === undefined) delete (expected as Partial<TabConfig>)[key]
  else (expected as unknown as Record<string, unknown>)[key] = value
  return finish(setKey(ws.text, found.tab, key, value), workspaceId, tabId, expected.title, expected)
}

export function setTabSort(yamlText: string | null, workspaceId: string, tabId: string, sort: SortKey[], defaults: SoiiConfig = DEFAULT_CONFIG): EditResult {
  return setTabKey(yamlText, workspaceId, tabId, 'sort', sort.length ? sort : undefined, defaults)
}

export function setTabQuery(yamlText: string | null, workspaceId: string, tabId: string, query: Query, defaults: SoiiConfig = DEFAULT_CONFIG): EditResult {
  return setTabKey(yamlText, workspaceId, tabId, 'query', query, defaults)
}
