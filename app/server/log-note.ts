// app/server/log-note.ts
// POST /api/log: validate a Log, then create a note or append to one in the vault on disk (spec §3).
// The browser never chooses a path for a new note, and can only append to a note that is in the
// compiled index. Every write is a local commit of just that file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { parseListInput } from '../lib/collections'
import {
  autoDates,
  buildNewNote,
  creatingKind,
  fieldsFor,
  formatEntry,
  kindById,
  numberValue,
  PERSON_TAIL,
  type LogField,
  type LogKind
} from '../lib/log'
import { appendEntry, patchFrontmatter } from '../lib/log-edit'
import type { NoteMeta } from '../lib/types'
import type { SoiiEnv } from './env'
import { commitLocal } from './local-commit'
import type { RunGit } from './sync'
import { canWrite, WRITE_NOT_CONFIGURED } from './write-note'

export const MAX_TEXT = 20_000
const MAX_VALUE = 500
const MAX_TITLE = 200

export type LogRequest =
  | { mode: 'new'; kind: LogKind; title: string; values: Record<string, string>; text: string; date: string; how: string | null }
  | { mode: 'append'; kind: LogKind; path: string; values: Record<string, string>; text: string; date: string; how: string | null }

export interface LogDeps {
  git: RunGit
  /** The compiled index's notes; only called for appends. May throw VaultNotBuiltError (→ 503). */
  notes: () => NoteMeta[]
}

export type LogResult =
  | { ok: true; path: string; mode: 'new' | 'append'; warning: string | null }
  | { ok: false; status: 400 | 404 | 409 | 501; error: string; message: string; path?: string }

type Fail = Extract<LogResult, { ok: false }>
type Bad = { ok: false; status: 400; error: string; message: string }

const fail = (status: Fail['status'], error: string, message: string, path?: string): Fail => ({ ok: false, status, error, message, ...(path ? { path } : {}) })
const bad = (error: string, message: string): Bad => ({ ok: false, status: 400, error, message })

export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function cleanValues(raw: unknown, fields: LogField[]): { ok: true; values: Record<string, string> } | Bad {
  if (raw === undefined || raw === null) return { ok: true, values: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) return bad('bad_request', 'That log could not be read.')
  const out: Record<string, string> = {}
  // Only the kind's own fields are read, so `soii`, `publish` or `__proto__` can never be set.
  for (const field of fields) {
    if (!Object.hasOwn(raw, field.key)) continue
    const v = (raw as Record<string, unknown>)[field.key]
    if (typeof v !== 'string' || v.length > MAX_VALUE) return bad('bad_value', `${field.label} is too long.`)
    const value = v.replace(/\s+/g, ' ').trim()
    if (!value) continue
    if (field.kind === 'list') {
      const list = parseListInput(value, field.label)
      if (!list.ok) return bad('bad_value', list.message)
      if (list.items.length) out[field.key] = list.items.join(', ')
      continue
    }
    if (field.kind === 'select' && !(field.options ?? []).includes(value)) {
      return bad('bad_value', `${field.label} must be one of: ${(field.options ?? []).join(', ')}.`)
    }
    if (field.kind === 'rating') {
      const n = numberValue(value)
      if (n === null || !Number.isInteger(n) || n < 1 || n > 5) return bad('bad_value', 'Rating is 1 to 5 stars.')
    }
    if (field.kind === 'number' && numberValue(value) === null) return bad('bad_value', `${field.label} must be a number.`)
    if (field.kind === 'date' && !isDay(value)) return bad('bad_value', `${field.label} must be a date.`)
    out[field.key] = value
  }
  return { ok: true, values: out }
}

export function parseLogRequest(body: unknown): { ok: true; req: LogRequest } | Bad {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('bad_request', 'That log could not be read.')
  const b = body as Record<string, unknown>
  const kind = typeof b.kind === 'string' ? kindById(b.kind) : null
  if (!kind) return bad('bad_kind', "soii doesn't know that kind of log.")
  if (b.mode !== 'new' && b.mode !== 'append') return bad('bad_request', 'That log could not be read.')
  if (!isDay(b.date)) return bad('bad_date', 'Pick a valid date.')
  const text = b.text ?? ''
  if (typeof text !== 'string' || text.length > MAX_TEXT) return bad('bad_text', 'That text is too long.')
  let how: string | null = null
  if (b.how !== undefined && b.how !== null && b.how !== '') {
    if (typeof b.how !== 'string' || !(kind.howOptions ?? []).includes(b.how)) return bad('bad_how', 'That is not one of the options.')
    how = b.how
  }
  const values = cleanValues(b.values, fieldsFor(kind, b.mode))
  if (!values.ok) return values

  if (b.mode === 'new') {
    const k = creatingKind(kind)
    if (!k.folder) return bad('cannot_create', `A ${kind.label.toLowerCase()} can't be created here.`)
    const title = typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim() : ''
    if (title.length > MAX_TITLE) return bad('bad_title', 'That name is too long.')
    if (k.id === 'expense' && !values.values.amount) return bad('amount_required', 'Add the amount first.')
    if (k.id !== 'expense' && !title) return bad('title_required', 'Give it a name first.')
    return { ok: true, req: { mode: 'new', kind, title, values: values.values, text, date: b.date, how } }
  }
  if (!kind.section) return bad('cannot_append', `A ${kind.label.toLowerCase()} is always a new note.`)
  if (typeof b.path !== 'string' || !b.path) return bad('bad_request', 'Pick the note to log to.')
  if (!text.trim() && Object.keys(values.values).length === 0) return bad('empty', 'Write something or change a field first.')
  return { ok: true, req: { mode: 'append', kind, path: b.path, values: values.values, text, date: b.date, how } }
}

export function inVault(env: SoiiEnv, path: string): string | null {
  const base = resolve(env.vaultPath ?? '')
  const file = resolve(join(base, path))
  return file.startsWith(base + sep) ? file : null
}

export { commitLocal } from './local-commit'

function typedChanges(kind: LogKind, changes: Record<string, string>): Record<string, string | number | string[]> {
  const byKey = new Map([...kind.quick, ...kind.more].map(f => [f.key, f]))
  return Object.fromEntries(
    Object.entries(changes).map(([k, v]) => {
      const f = byKey.get(k)
      if (f?.kind === 'list') return [k, v.split(',').map(s => s.trim()).filter(Boolean)]
      const n = f && (f.kind === 'number' || f.kind === 'rating') ? numberValue(v) : null
      return [k, n ?? v]
    })
  )
}

async function logNew(env: SoiiEnv, req: Extract<LogRequest, { mode: 'new' }>, deps: LogDeps): Promise<LogResult> {
  const kind = creatingKind(req.kind)
  const note = buildNewNote(req)
  // buildNewNote only produces <folder>/<clean name>.md; this guards that promise.
  if (!note.path.startsWith(`${kind.folder}/`) || note.path.split('/').includes('..') || !note.path.endsWith('.md')) {
    return fail(400, 'bad_path', 'That name makes an invalid file name.')
  }
  const message = `soii log: ${kind.id} "${note.title}"`
  const file = inVault(env, note.path)
  if (!file) return fail(400, 'bad_path', 'That name makes an invalid file name.')
  if (existsSync(file)) return fail(409, 'exists', `"${note.title}" already exists.`, note.path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, note.content, { flag: 'wx' })
  const warning = await commitLocal(env, deps.git, note.path, message)
  return { ok: true, path: note.path, mode: 'new', warning }
}

async function logAppend(env: SoiiEnv, req: Extract<LogRequest, { mode: 'append' }>, deps: LogDeps): Promise<LogResult> {
  const meta = deps.notes().find(n => n.path === req.path)
  if (!meta || !/\.md$/i.test(meta.path)) return fail(404, 'not_found', "That note isn't in soii's copy of the vault.")
  if (req.kind.type && meta.type !== req.kind.type) return fail(400, 'wrong_type', `That note isn't a ${req.kind.type}.`)
  const section = req.kind.section ?? 'Log'
  const changes = autoDates(req.kind, req.values, req.date, meta.frontmatter)
  const typed = typedChanges(req.kind, changes)
  const entry = formatEntry({ date: req.date, text: req.text, how: req.how, changes: req.text.trim() ? undefined : changes })
  const before = req.kind.type === 'person' ? PERSON_TAIL : []
  const edit = (source: string) => {
    const patched = Object.keys(typed).length ? patchFrontmatter(source, typed, { updated: req.date }) : { content: source, warning: null }
    return { content: appendEntry(patched.content, section, entry, { before }), warning: patched.warning }
  }
  const message = `soii log: ${req.kind.id} "${meta.title}"`
  const gone = () => fail(404, 'gone', `"${meta.title}" isn't in the vault any more. It may have been moved or deleted.`)

  const file = inVault(env, meta.path)
  if (!file) return fail(400, 'bad_path', 'That note is outside the vault.')
  if (!existsSync(file)) return gone()
  const next = edit(readFileSync(file, 'utf8'))
  writeFileSync(file, next.content)
  const committed = await commitLocal(env, deps.git, meta.path, message)
  return { ok: true, path: meta.path, mode: 'append', warning: [next.warning, committed].filter(Boolean).join(' ') }
}

export async function logNote(env: SoiiEnv, body: unknown, deps: LogDeps): Promise<LogResult> {
  const parsed = parseLogRequest(body)
  if (!parsed.ok) return parsed
  if (!canWrite(env)) return fail(501, 'write_not_configured', WRITE_NOT_CONFIGURED)
  return parsed.req.mode === 'new' ? logNew(env, parsed.req, deps) : logAppend(env, parsed.req, deps)
}
