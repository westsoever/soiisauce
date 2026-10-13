// app/server/write-note.ts
// Writes a new Library note into the vault on disk (VAULT_PATH). The browser sends only {type, values}; the path
// and the file are rebuilt here, so nothing the client says can choose where a file lands. An existing file is never overwritten.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { LIST_FIELDS, parseListInput } from '../lib/collections'
import { buildNote, NEW_NOTE_SPECS } from '../lib/new-note'
import type { SoiiEnv } from './env'
import { commitLocal } from './local-commit'
import { runGit, type RunGit } from './sync'

export type WriteResult =
  | { ok: true; path: string; warning: string | null }
  | { ok: false; status: 400 | 409 | 501; error: string; message: string }

/** soii writes straight into the vault folder, so it can write whenever it knows where that is. */
export function canWrite(env: SoiiEnv): boolean {
  return env.vaultPath !== null
}

export const WRITE_NOT_CONFIGURED = 'Writing needs your vault folder. Set VAULT_PATH.'

const MAX_VALUE = 500

function parseBody(body: unknown): { type: string; values: Record<string, string> } | null {
  if (!body || typeof body !== 'object') return null
  const { type, values } = body as { type?: unknown; values?: unknown }
  if (typeof type !== 'string' || !Object.hasOwn(NEW_NOTE_SPECS, type)) return null
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(values)) {
    if (typeof v !== 'string' || v.length > MAX_VALUE) return null
    clean[k] = v
  }
  return { type, values: clean }
}

const fail = (status: 400 | 409 | 501, error: string, message: string): WriteResult => ({ ok: false, status, error, message })

export async function writeNote(env: SoiiEnv, body: unknown, git: RunGit = runGit): Promise<WriteResult> {
  const input = parseBody(body)
  if (!input) return fail(400, 'bad_request', 'That note could not be read.')
  if (!input.values.title?.trim()) return fail(400, 'title_required', 'Give it a title first.')
  for (const { key, label } of LIST_FIELDS) {
    const raw = input.values[key]
    if (!raw) continue
    const list = parseListInput(raw, label)
    if (!list.ok) return fail(400, 'bad_value', list.message)
    input.values[key] = list.items.join(', ')
  }
  const spec = NEW_NOTE_SPECS[input.type]
  const note = buildNote(spec, input.values)
  // buildNote only ever produces <spec.folder>/<clean name>.md; this guards that promise.
  if (!note.path.startsWith(`${spec.folder}/`) || note.path.split('/').includes('..') || !note.path.endsWith('.md')) {
    return fail(400, 'bad_path', 'That title makes an invalid file name.')
  }
  if (!canWrite(env)) return fail(501, 'write_not_configured', WRITE_NOT_CONFIGURED)
  return writeToDisk(env, git, note, spec.noun, input.values.title.trim())
}

async function writeToDisk(env: SoiiEnv, git: RunGit, note: { path: string; content: string }, noun: string, title: string): Promise<WriteResult> {
  const base = resolve(env.vaultPath ?? '')
  const file = resolve(join(base, note.path))
  if (!file.startsWith(base + sep)) return fail(400, 'bad_path', 'That title makes an invalid file name.')
  if (existsSync(file)) return fail(409, 'exists', 'A note with that name already exists.')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, note.content, { flag: 'wx' })
  // Like Log: a local commit of just this file, so Sync can push it. Not pushed here: a failed push must never turn an Add into an error.
  const warning = await commitLocal(env, git, note.path, `soii: add ${noun} "${title}"`)
  return { ok: true, path: note.path, warning }
}
