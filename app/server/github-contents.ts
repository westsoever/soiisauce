// app/server/github-contents.ts
// Reading and committing one vault file through GitHub's Contents API, with VAULT_WRITE_TOKEN.
// A PUT without `sha` only creates (GitHub refuses to overwrite); with `sha` it only updates the
// version we read, so a concurrent edit comes back as a conflict instead of being lost.
import { encodePath } from '../lib/paths'
import type { SoiiEnv } from './env'
import type { FetchLike } from './github-oauth'

export type GetResult =
  | { ok: true; file: { content: string; sha: string } | null }
  | { ok: false; reason: 'unreachable' | 'rejected' | 'too_large' | 'error'; status: number }

export type PutResult =
  | { ok: true; commitUrl: string | null }
  | { ok: false; reason: 'exists' | 'conflict' | 'rejected' | 'unreachable' | 'error'; status: number }

const headers = (env: SoiiEnv) => ({
  Authorization: `Bearer ${env.vaultWriteToken}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'soii'
})

const contentsUrl = (env: SoiiEnv, path: string) => `https://api.github.com/repos/${env.vaultRepo}/contents/${encodePath(path)}`

export async function getFile(env: SoiiEnv, path: string, fetchImpl: FetchLike): Promise<GetResult> {
  let res: Response
  try {
    res = await fetchImpl(`${contentsUrl(env, path)}?ref=${encodeURIComponent(env.vaultRef)}`, { method: 'GET', headers: headers(env) })
  } catch {
    return { ok: false, reason: 'unreachable', status: 0 }
  }
  if (res.status === 404) return { ok: true, file: null }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'rejected', status: res.status }
  if (!res.ok) return { ok: false, reason: 'error', status: res.status }
  const data = (await res.json().catch(() => null)) as { sha?: unknown; encoding?: unknown; content?: unknown } | null
  // Files over 1 MB come back without inline content.
  if (typeof data?.sha !== 'string' || data.encoding !== 'base64' || typeof data.content !== 'string') {
    return { ok: false, reason: 'too_large', status: res.status }
  }
  return { ok: true, file: { content: Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8'), sha: data.sha } }
}

export async function putFile(env: SoiiEnv, path: string, content: string, message: string, sha: string | null, fetchImpl: FetchLike): Promise<PutResult> {
  let res: Response
  try {
    res = await fetchImpl(contentsUrl(env, path), {
      method: 'PUT',
      headers: headers(env),
      body: JSON.stringify({ message, content: Buffer.from(content, 'utf8').toString('base64'), branch: env.vaultRef, ...(sha ? { sha } : {}) })
    })
  } catch {
    return { ok: false, reason: 'unreachable', status: 0 }
  }
  if (res.status === 200 || res.status === 201) {
    const data = (await res.json().catch(() => null)) as { commit?: { html_url?: string } } | null
    return { ok: true, commitUrl: data?.commit?.html_url ?? null }
  }
  if (res.status === 422 && !sha) return { ok: false, reason: 'exists', status: 422 }
  if ((res.status === 409 || res.status === 422) && sha) return { ok: false, reason: 'conflict', status: res.status }
  if (res.status === 401 || res.status === 403 || res.status === 404) return { ok: false, reason: 'rejected', status: res.status }
  return { ok: false, reason: 'error', status: res.status }
}
