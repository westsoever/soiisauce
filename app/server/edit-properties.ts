// app/server/edit-properties.ts
// POST /api/notes/properties: set one frontmatter property on a note from the reader (D62).
// Same rules as a Log append: only notes in the compiled index, and each save is a local commit of just that file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { cleanPropertyValue, isEditableKey, type PropertyValue } from '../lib/properties'
import { setProperty } from '../lib/property-edit'
import type { SoiiEnv } from './env'
import { commitLocal, inVault, isDay, type LogDeps } from './log-note'
import { canWrite, WRITE_NOT_CONFIGURED } from './write-note'

export interface PropertyRequest {
  path: string
  key: string
  value: PropertyValue
  /** The browser's local day, for `updated:` when the note keeps one. */
  date: string | null
}

export type PropertyResult =
  | { ok: true; path: string; warning: string | null }
  | { ok: false; status: 400 | 404 | 422 | 501; error: string; message: string }

type Fail = Extract<PropertyResult, { ok: false }>
type Bad = Fail & { status: 400 }

const fail = (status: Fail['status'], error: string, message: string): Fail => ({ ok: false, status, error, message })
const bad = (error: string, message: string): Bad => ({ ok: false, status: 400, error, message })

export function parsePropertyRequest(body: unknown): { ok: true; req: PropertyRequest } | Bad {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('bad_request', 'That change could not be read.')
  const b = body as Record<string, unknown>
  if (typeof b.path !== 'string' || !b.path) return bad('bad_request', 'Pick the note to change.')
  if (!isEditableKey(b.key)) return bad('bad_key', "soii can't change that property.")
  if (!Object.hasOwn(b, 'value')) return bad('bad_value', 'That value could not be read.')
  const value = cleanPropertyValue(b.value)
  if (!value.ok) return bad('bad_value', value.message)
  let date: string | null = null
  if (b.date !== undefined && b.date !== null) {
    if (!isDay(b.date)) return bad('bad_date', 'That date is not valid.')
    date = b.date
  }
  return { ok: true, req: { path: b.path, key: b.key, value: value.value, date } }
}

const UNREADABLE = "Couldn't read this note's properties safely, so nothing was changed. Fix them in Obsidian first."

export async function editProperty(env: SoiiEnv, body: unknown, deps: LogDeps): Promise<PropertyResult> {
  const parsed = parsePropertyRequest(body)
  if (!parsed.ok) return parsed
  if (!canWrite(env)) return fail(501, 'write_not_configured', WRITE_NOT_CONFIGURED)
  const { key, value, date } = parsed.req
  const meta = deps.notes().find(n => n.path === parsed.req.path)
  if (!meta || !/\.md$/i.test(meta.path)) return fail(404, 'not_found', "That note isn't in soii's copy of the vault.")

  const edit = (source: string) => setProperty(source, key, value, date ? { updated: date } : {})
  const message = `soii: edit "${meta.title}" (${key})`
  const gone = () => fail(404, 'gone', `"${meta.title}" isn't in the vault any more. It may have been moved or deleted.`)

  const file = inVault(env, meta.path)
  if (!file) return fail(400, 'bad_path', 'That note is outside the vault.')
  if (!existsSync(file)) return gone()
  const next = edit(readFileSync(file, 'utf8'))
  if (!next.ok) return fail(422, 'unreadable', UNREADABLE)
  writeFileSync(file, next.content)
  const warning = await commitLocal(env, deps.git, meta.path, message)
  return { ok: true, path: meta.path, warning }
}
