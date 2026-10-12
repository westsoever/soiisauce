// app/server/write-note.ts
// Writes a new Library note into the vault. The browser sends only {type, values}; the path
// and the file are rebuilt here, so nothing the client says can choose where a file lands.
//  - GitHub: a commit on VAULT_REF through the Contents API (needs VAULT_REPO + VAULT_WRITE_TOKEN).
//    No `sha` is sent, so GitHub refuses to overwrite an existing file.
//  - Local disk: VAULT_PATH, development only (never on Vercel). Same rule, no overwrite.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { LIST_FIELDS, parseListInput } from '../lib/collections'
import { buildNote, NEW_NOTE_SPECS } from '../lib/new-note'
import type { SoiiEnv } from './env'
import { putFile } from './github-contents'
import { commitLocal } from './local-commit'
import { runGit, type RunGit } from './sync'
import type { FetchLike } from './github-oauth'

export type WriteResult =
  | { ok: true; path: string; via: 'github' | 'local'; commitUrl: string | null; warning: string | null }
  | { ok: false; status: 400 | 409 | 501 | 502; error: string; message: string }

export function writeTarget(env: SoiiEnv): 'github' | 'local' | null {
  if (env.local && env.vaultPath) return 'local'
  if (env.vaultRepo && env.vaultWriteToken) return 'github'
  if (env.vaultPath && !env.onVercel) return 'local'
  return null
}

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

const fail = (status: 400 | 409 | 501 | 502, error: string, message: string): WriteResult => ({ ok: false, status, error, message })

export async function writeNote(env: SoiiEnv, body: unknown, fetchImpl: FetchLike, git: RunGit = runGit): Promise<WriteResult> {
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
  const target = writeTarget(env)
  if (target === 'github') return writeToGithub(env, note, spec.noun, fetchImpl)
  if (target === 'local') return writeToDisk(env, git, note, spec.noun, input.values.title.trim())
  return fail(501, 'write_not_configured', 'Writing is not set up. Add VAULT_REPO and VAULT_WRITE_TOKEN.')
}

async function writeToGithub(env: SoiiEnv, note: { path: string; content: string }, noun: string, fetchImpl: FetchLike): Promise<WriteResult> {
  const title = note.content.match(/^# (.*)$/m)?.[1] ?? note.path
  const put = await putFile(env, note.path, note.content, `soii: add ${noun} "${title}"`, null, fetchImpl)
  if (put.ok) return { ok: true, path: note.path, via: 'github', commitUrl: put.commitUrl, warning: null }
  if (put.reason === 'exists') return fail(409, 'exists', `A note called "${title}" already exists.`)
  if (put.reason === 'unreachable') return fail(502, 'github_unreachable', "Couldn't reach GitHub.")
  if (put.reason === 'rejected') {
    return fail(502, 'github_rejected', 'GitHub refused the write. Check that VAULT_WRITE_TOKEN has Contents: read and write on the vault repo.')
  }
  return fail(502, 'github_error', `GitHub answered ${put.status}.`)
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
  return { ok: true, path: note.path, via: 'local', commitUrl: null, warning }
}
