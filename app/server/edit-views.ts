// app/server/edit-views.ts
// /api/views and `soii view`: add, change (filter/sort) or remove a view in soii.config.yml (spec §4, D101).
// Same write rules as edit-properties.ts: GitHub writes send the sha and retry once on a conflict, local
// writes commit just the config file. The YAML editing itself is app/lib/view-edit.ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { querySchema, tabSchema } from '../lib/config-schema'
import type { Query, SortKey } from '../lib/types'
import { addTab, removeTab, setTabQuery, setTabSort, type EditResult, type TabDraft } from '../lib/view-edit'
import type { SoiiEnv } from './env'
import { getFile, putFile } from './github-contents'
import type { FetchLike } from './github-oauth'
import { commitLocal, githubFail, pullAfterCommit } from './log-note'
import type { RunGit } from './sync'
import { writeTarget } from './write-note'

export type ViewRequest =
  | { action: 'add'; workspace: string; tab: TabDraft }
  | { action: 'update'; workspace: string; tabId: string; query?: Query; sort?: SortKey[] }
  | { action: 'remove'; workspace: string; tabId: string }

export type ViewResult =
  | { ok: true; workspace: string; tabId: string; title: string; via: 'github' | 'local'; commitUrl: string | null; warning: string | null }
  | { ok: false; status: 400 | 409 | 501 | 502; error: string; message: string }

type Bad = { ok: false; status: 400; error: string; message: string }
type Parsed = { ok: true; req: ViewRequest } | Bad
const bad = (error: string, message: string): Bad => ({ ok: false, status: 400, error, message })
const MAX_BODY = 20_000
const CONFIG_FILES = ['soii.config.yml', 'soii.config.yaml']

const draftSchema = tabSchema.partial({ id: true })
const sortSchema = z.array(z.object({ field: z.string().min(1), dir: z.enum(['asc', 'desc']) }).strict())
const updateSchema = z.object({ query: querySchema.optional(), sort: sortSchema.optional() }).strict()

const tooLarge = (body: unknown) => JSON.stringify(body ?? null).length > MAX_BODY

export function parseAddRequest(body: unknown): Parsed {
  if (tooLarge(body)) return bad('too_large', 'That view is too large.')
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('bad_request', 'That view could not be read.')
  const b = body as Record<string, unknown>
  if (typeof b.workspace !== 'string' || !b.workspace) return bad('bad_request', 'Pick a workspace for the view.')
  const tab = draftSchema.safeParse(b.tab)
  if (!tab.success) return bad('invalid_view', `That view isn't valid: ${tab.error.issues[0]?.message ?? 'unknown problem'} (${tab.error.issues[0]?.path.join('.') ?? ''}).`)
  return { ok: true, req: { action: 'add', workspace: b.workspace, tab: tab.data as TabDraft } }
}

export function parseUpdateRequest(workspace: string, tabId: string, body: unknown): Parsed {
  if (tooLarge(body)) return bad('too_large', 'That change is too large.')
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return bad('bad_request', 'Only the filter and the sort can be changed here.')
  const { query, sort } = parsed.data
  if (query === undefined && sort === undefined) return bad('bad_request', 'Nothing to change.')
  return { ok: true, req: { action: 'update', workspace, tabId, ...(query !== undefined ? { query: query as Query } : {}), ...(sort !== undefined ? { sort } : {}) } }
}

function apply(text: string | null, req: ViewRequest): EditResult {
  if (req.action === 'add') return addTab(text, req.workspace, req.tab)
  if (req.action === 'remove') return removeTab(text, req.workspace, req.tabId)
  let result: EditResult = { ok: true, yaml: text ?? '', tabId: req.tabId, title: req.tabId }
  if (req.query !== undefined) result = setTabQuery(text, req.workspace, req.tabId, req.query)
  if (result.ok && req.sort !== undefined) result = setTabSort(req.query !== undefined ? result.yaml : text, req.workspace, req.tabId, req.sort)
  return result
}

function message(req: ViewRequest, title: string): string {
  if (req.action === 'add') return `soii: add view "${title}" to ${req.workspace}`
  if (req.action === 'remove') return `soii: remove view "${title}" from ${req.workspace}`
  if (req.query !== undefined && req.sort !== undefined) return `soii: filter and sort view "${title}"`
  return req.query !== undefined ? `soii: filter view "${title}"` : `soii: sort view "${title}"`
}

export async function editViews(env: SoiiEnv, req: ViewRequest, deps: { fetch: FetchLike; git: RunGit }): Promise<ViewResult> {
  const target = writeTarget(env)
  if (!target) return { ok: false, status: 501, error: 'write_not_configured', message: 'Writing is not set up, so views can only be changed in soii.config.yml.' }

  if (target === 'github') {
    for (let attempt = 0; attempt < 2; attempt++) {
      let path = CONFIG_FILES[0]
      let file: { content: string; sha: string } | null = null
      for (const name of CONFIG_FILES) {
        const got = await getFile(env, name, deps.fetch)
        if (!got.ok) return githubFail(got) as Extract<ViewResult, { ok: false }>
        if (got.file) {
          path = name
          file = got.file
          break
        }
      }
      const edited = apply(file?.content ?? null, req)
      if (!edited.ok) return edited
      const put = await putFile(env, path, edited.yaml, message(req, edited.title), file?.sha ?? null, deps.fetch)
      if (put.ok) {
        const pull = await pullAfterCommit(env, deps.git)
        return { ok: true, workspace: req.workspace, tabId: edited.tabId, title: edited.title, via: 'github', commitUrl: put.commitUrl, warning: pull.warning }
      }
      if (put.reason !== 'conflict' && put.reason !== 'exists') return githubFail(put) as Extract<ViewResult, { ok: false }>
    }
    return { ok: false, status: 409, error: 'conflict', message: 'Your soii.config.yml changed on GitHub while saving. Try again.' }
  }

  const vault = env.vaultPath ?? ''
  const name = CONFIG_FILES.find(n => existsSync(join(vault, n))) ?? CONFIG_FILES[0]
  const file = join(vault, name)
  const edited = apply(existsSync(file) ? readFileSync(file, 'utf8') : null, req)
  if (!edited.ok) return edited
  writeFileSync(file, edited.yaml)
  const warning = await commitLocal(env, deps.git, name, message(req, edited.title))
  return { ok: true, workspace: req.workspace, tabId: edited.tabId, title: edited.title, via: 'local', commitUrl: null, warning }
}
