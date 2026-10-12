// app/cli/view.ts
// `soii view …`: the /soii-view skill's (and /soii-health's) way to read and change views, through the
// same code as the app's /api/views (app/server/edit-views.ts), so the two can't drift (D101).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import { querySchema, tabSchema } from '../lib/config-schema'
import { DEFAULT_CONFIG } from '../lib/default-config'
import { canonicalType, runTab } from '../lib/query'
import type { NoteMeta, TabConfig, VaultIndex } from '../lib/types'
import { vaultFields } from '../lib/view-fields'
import { overlap, SIMILAR, similarTabs } from '../lib/view-overlap'
import { editViews, parseAddRequest, parseUpdateRequest, type ViewRequest } from '../server/edit-views'
import { readEnv } from '../server/env'
import { runGit } from '../server/sync'
import { compileVault } from '../vault/compile'
import type { Flags } from './args'
import type { Ctx } from './context'
import { configDir, readRegistry } from './registry'

const PORT = 5011
const USAGE = 'Usage: soii view fields|preview|add|filter|sort|remove|list … (see `soii help`)'

class ArgError extends Error {}

const VAULT_MARKERS = ['soii.config.yml', 'soii.config.yaml', '.soii', '.obsidian']
const isVault = (dir: string) => VAULT_MARKERS.some(n => existsSync(join(dir, n)))
const notAVault = (dir: string) => new ArgError(`${dir} is not a soii vault (no soii.config.yml, .soii/ or .obsidian/ in it). Run this inside your vault, or pass --vault <folder>.`)

/** Which vault to work on. It must look like one: a write must never create soii.config.yml in a random folder. */
function vaultDir(ctx: Ctx, flags: Flags): string {
  if (flags.vault) {
    const dir = resolve(ctx.cwd, flags.vault)
    if (!isVault(dir)) throw notAVault(dir)
    return dir
  }
  if (isVault(ctx.cwd)) return ctx.cwd
  const reg = readRegistry(configDir(ctx.env))
  if (!reg) throw new ArgError('No vault here. Run this inside your vault, or pass --vault <folder>.')
  if (!isVault(reg.vault)) throw notAVault(reg.vault)
  return reg.vault
}

function json<T>(raw: string | undefined, name: string): T {
  if (raw === undefined) throw new ArgError(`--${name} is required.`)
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new ArgError(`--${name} is not valid JSON.`)
  }
}

async function loadIndex(vault: string): Promise<VaultIndex> {
  const out = mkdtempSync(join(tmpdir(), 'soii-view-'))
  try {
    return (await compileVault({ vaultDir: vault, outDir: out })).index
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

/** Ids of the workspaces the vault's own config defines (a built-in id there replaces the built-in whole). */
function definedWorkspaces(vault: string): Set<string> {
  const name = ['soii.config.yml', 'soii.config.yaml'].find(n => existsSync(join(vault, n)))
  if (!name) return new Set()
  try {
    const list = (parse(readFileSync(join(vault, name), 'utf8')) as { workspaces?: { id?: unknown }[] } | null)?.workspaces
    return new Set(Array.isArray(list) ? list.map(w => String(w?.id)) : [])
  } catch {
    return new Set()
  }
}

function need(args: string[], n: number, usage: string): string[] {
  if (args.length !== n) throw new ArgError(`Usage: soii view ${usage}`)
  return args
}

export async function view(ctx: Ctx, args: string[], flags: Flags): Promise<number> {
  const print = (data: unknown, text: string) => ctx.out(flags.json ? JSON.stringify(data, null, 2) : text)
  try {
    const [sub, ...rest] = args
    const vault = vaultDir(ctx, flags)
    const write = (req: ViewRequest) => editViews(readEnv({ SOII_LOCAL: '1', VAULT_PATH: vault }), req, { fetch: fetch, git: runGit })
    const refuse = (r: { message: string }) => {
      ctx.err(r.message)
      return 1
    }

    if (sub === 'fields') {
      need(rest, 0, 'fields [--type <type>]')
      const index = await loadIndex(vault)
      const notes = flags.type ? index.notes.filter(n => n.type === canonicalType(flags.type!, index.config.types)) : index.notes
      const f = vaultFields(notes)
      const line = (label: string, list: { value: string; count: number }[]) => `${label}: ${list.slice(0, 15).map(x => `${x.value} (${x.count})`).join(', ') || 'none'}`
      print(f, [line('Types', f.types), line('Tags', f.tags), line('Folders', f.folders), ...f.fields.map(x => line(`${x.field} [${x.count} notes]`, x.values))].join('\n'))
      return 0
    }

    if (sub === 'preview') {
      const [workspace] = need(rest, 1, 'preview <workspace> --tab <json>')
      const draft = tabSchema.partial({ id: true }).safeParse(json(flags.tab, 'tab'))
      if (!draft.success) return refuse({ message: `That view isn't valid: ${draft.error.issues[0]?.message}` })
      const index = await loadIndex(vault)
      const ws = index.config.workspaces.find(w => w.id === workspace)
      if (!ws) return refuse({ message: `No workspace "${workspace}". Views can only be added to a workspace you already have.` })
      const tab = { id: '__preview__', ...draft.data } as TabConfig
      const notes = runTab(tab, index)
      const similar = similarTabs(tab, ws, index)
      const titles = notes.slice(0, 10).map(n => n.title)
      const text = [
        notes.length ? `Matches ${notes.length} notes: ${titles.join(', ')}${notes.length > 10 ? ', …' : ''}` : 'Matches no notes yet.',
        ...similar.map(s => `Similar: ${s.title} (${Math.round(s.overlap * 100)}% the same notes)`)
      ].join('\n')
      print({ count: notes.length, titles, similar }, text)
      return 0
    }

    if (sub === 'add') {
      const [workspace] = need(rest, 1, 'add <workspace> --tab <json>')
      const parsed = parseAddRequest({ workspace, tab: json(flags.tab, 'tab') })
      if (!parsed.ok) return refuse(parsed)
      const r = await write(parsed.req)
      if (!r.ok) return refuse(r)
      const url = `http://localhost:${PORT}/#/${r.workspace}/${r.tabId}`
      print({ workspace: r.workspace, tabId: r.tabId, title: r.title, url, warning: r.warning }, `Added "${r.title}" to ${r.workspace}: ${url}${r.warning ? `\n${r.warning}` : ''}`)
      return 0
    }

    if (sub === 'filter') {
      const [workspace, tabId] = need(rest, 2, 'filter <workspace> <tab> --query <json>')
      const query = querySchema.safeParse(json(flags.query, 'query'))
      if (!query.success) return refuse({ message: `That filter isn't valid: ${query.error.issues[0]?.message}` })
      const index = await loadIndex(vault)
      const tab = index.config.workspaces.find(w => w.id === workspace)?.tabs.find(t => t.id === tabId)
      const before = tab ? runTab(tab, index).length : 0
      const after = tab ? runTab({ ...tab, query: query.data as TabConfig['query'] }, index).length : 0
      const r = await write({ action: 'update', workspace, tabId, query: query.data as TabConfig['query'] })
      if (!r.ok) return refuse(r)
      print({ workspace, tabId, before, after, warning: r.warning }, `${r.title}: ${before} → ${after} notes.${r.warning ? `\n${r.warning}` : ''}`)
      return 0
    }

    if (sub === 'sort') {
      const [workspace, tabId] = need(rest, 2, 'sort <workspace> <tab> --sort <json>')
      const parsed = parseUpdateRequest(workspace, tabId, { sort: json(flags.sort, 'sort') })
      if (!parsed.ok) return refuse(parsed)
      const r = await write(parsed.req)
      if (!r.ok) return refuse(r)
      print({ workspace, tabId, warning: r.warning }, `${r.title}: same notes, new order.${r.warning ? `\n${r.warning}` : ''}`)
      return 0
    }

    if (sub === 'remove') {
      const [workspace, tabId] = need(rest, 2, 'remove <workspace> <tab>')
      const r = await write({ action: 'remove', workspace, tabId })
      if (!r.ok) return refuse(r)
      print({ workspace, tabId, warning: r.warning }, `Removed "${r.title}" from ${workspace}.${r.warning ? `\n${r.warning}` : ''}`)
      return 0
    }

    if (sub === 'list') {
      need(rest, 0, 'list')
      const index = await loadIndex(vault)
      const empty: { workspace: string; tab: string; title: string }[] = []
      const similar: { workspace: string; a: string; b: string; overlap: number }[] = []
      // `empty` and `similar` are a clean-up list, so they cover only what the owner wrote: a built-in workspace
      // the config doesn't define is soii's, not theirs. Similar means the same layout showing the same notes;
      // a table and a list of the same people are two ways of looking, not a duplicate.
      const builtIn = new Set(DEFAULT_CONFIG.workspaces.map(w => w.id))
      const defined = definedWorkspaces(vault)
      const workspaces = index.config.workspaces.map(ws => {
        const matched = new Map<string, NoteMeta[]>(ws.tabs.map(t => [t.id, runTab(t, index)]))
        const owned = !builtIn.has(ws.id) || defined.has(ws.id)
        ws.tabs.forEach((t, i) => {
          if (!owned) return
          if (matched.get(t.id)!.length === 0) empty.push({ workspace: ws.id, tab: t.id, title: t.title })
          for (const u of ws.tabs.slice(i + 1)) {
            if (u.view !== t.view) continue
            const o = overlap(matched.get(t.id)!, matched.get(u.id)!)
            if (o >= SIMILAR) similar.push({ workspace: ws.id, a: t.id, b: u.id, overlap: o })
          }
        })
        return { id: ws.id, title: ws.title, tabs: ws.tabs.map(t => ({ id: t.id, title: t.title, view: t.view, count: matched.get(t.id)!.length })) }
      })
      const text = [
        ...workspaces.map(w => `${w.title} (${w.id}): ${w.tabs.map(t => `${t.title} [${t.view}, ${t.count}]`).join(', ')}`),
        ...empty.map(e => `Empty: ${e.workspace}/${e.tab}`),
        ...similar.map(s => `Similar: ${s.workspace}/${s.a} and ${s.workspace}/${s.b} (${Math.round(s.overlap * 100)}%)`)
      ].join('\n')
      print({ workspaces, empty, similar }, text)
      return 0
    }

    throw new ArgError(USAGE)
  } catch (err) {
    if (err instanceof ArgError) {
      ctx.err(`soii view: ${err.message}`)
      return 2
    }
    throw err
  }
}
