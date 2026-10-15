// soii's API (spec §6.3): one Hono app, served by app/serve.ts on this machine. There is no sign-in: local mode
// only listens on localhost and refuses requests for any other Host (app/server/local.ts).
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { join } from 'node:path'
import { decodePath } from '../lib/paths'
import { captureNote } from './capture-note'
import { createCoverRoute } from './covers/route'
import type { FetchLike } from './covers/types'
import { applyDecorators } from './decorate'
import { editProperty } from './edit-properties'
import { editViews, parseAddRequest, parseUpdateRequest, type ViewRequest } from './edit-views'
import { readEnv, SIGNING_SECRET } from './env'
import { serveFile } from './files'
import { logNote } from './log-note'
import { createRatesProvider } from './rates'
import { canSync, runGit, syncVault, type RunGit } from './sync'
import { createTexCompiler, type TexCompiler } from './tex'
import { createVersionChecker, gitLsRemote, type VersionChecker } from './version'
import { remoteFromEnv } from '../cli/vault-files'
import { hostHeaderAllowed } from './local'
import { requestOrigin } from './origin'
import { createVaultStore, defaultGeneratedDir, VaultNotBuiltError, type VaultStore } from './vault-store'
import { canWrite, writeNote } from './write-note'

export interface AppOptions {
  env?: Record<string, string | undefined>
  generatedDir?: string
  store?: VaultStore
  fetch?: FetchLike
  now?: () => number
  git?: RunGit
  /** Replaces the release check (tests). By default local mode checks soii's remote for a newer tag. */
  version?: VersionChecker
  /** LaTeX compiler (tests). Undefined: one over VAULT_PATH when it is set; null: none. */
  tex?: TexCompiler | null
}

/** The decoded rest of the raw (still percent-encoded) path after `prefix`, or null. */
function pathAfter(c: Context, prefix: string): string | null {
  const raw = new URL(c.req.url).pathname
  if (!raw.startsWith(prefix)) return null
  return decodePath(raw.slice(prefix.length))
}

export function createSoiiApp(opts: AppOptions = {}): Hono {
  const source = opts.env ?? process.env
  const env = readEnv(source)
  const now = opts.now ?? Date.now
  const fetchImpl: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init))
  const store = opts.store ?? createVaultStore(opts.generatedDir ?? defaultGeneratedDir(source))
  const tex = opts.tex !== undefined ? opts.tex : env.vaultPath ? createTexCompiler({ vaultDir: env.vaultPath, cacheDir: join(env.vaultPath, '.soii', 'cache', 'tex') }) : null
  const rates = createRatesProvider({ fetch: fetchImpl, now })
  const version =
    opts.version ?? (env.local ? createVersionChecker({ installed: env.soiiVersion, lsRemote: gitLsRemote(remoteFromEnv(source), opts.git ?? runGit) }) : null)
  const app = new Hono()
  if (env.local && !env.localForce) {
    app.use('*', async (c, next) => (hostHeaderAllowed(c.req.header('host')) ? next() : c.json({ error: 'bad_host' }, 403)))
  }
  const decorateCtx = (c: Context) => ({ secret: SIGNING_SECRET, origin: requestOrigin(c) })

  app.get('/api/health', c => {
    const meta = store.meta()
    return c.json({ ok: true, commit: meta?.commit ?? null, vaultCommit: meta?.vaultCommit ?? null, builtAt: meta?.builtAt ?? null })
  })

  // The installed and the newest release, for the sidebar's "Update available". Only an installed (local mode) soii has
  // anything to update from; asking starts the checks, and serve.ts asks once at startup.
  app.get('/api/version', c => {
    if (!env.local || !version) return c.json({ installed: null, latest: null, updateAvailable: false, releaseUrl: null })
    version.ensureStarted()
    return c.json(version.info())
  })

  // Exchange rates (units per 1 EUR) for the Finance currency switch; cached for hours, with a built-in fallback.
  app.get('/api/rates', async c => c.json(await rates.get()))

  // ---- vault ----
  app.get('/api/vault', c => {
    const index = store.index()
    const ctx = decorateCtx(c)
    return c.json({ ...index, notes: index.notes.map(n => applyDecorators(n, ctx)) })
  })

  app.get('/api/notes/*', c => {
    const id = pathAfter(c, '/api/notes/')
    const doc = id === null ? null : store.note(id)
    if (!doc) return c.json({ error: 'not_found' }, 404)
    return c.json(applyDecorators(doc, decorateCtx(c)))
  })

  // ---- writing (Library "Add") and syncing ----
  // State-changing routes: the request must come from soii's own page, not from another site open in the browser.
  const sameOrigin: MiddlewareHandler = async (c, next) => {
    if (c.req.header('origin') !== requestOrigin(c)) return c.json({ error: 'bad_origin' }, 403)
    await next()
  }

  app.get('/api/capabilities', c => c.json({ write: canWrite(env), sync: canSync(env) }))

  app.post('/api/notes', sameOrigin, async c => {
    const body = await c.req.json().catch(() => null)
    const result = await writeNote(env, body, opts.git)
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    return c.json({ path: result.path, warning: result.warning }, 201)
  })

  app.post('/api/sync', sameOrigin, async c => {
    const result = await syncVault(env, opts.git, { push: env.local })
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    // Sync is when you'd ask "anything new?": look for a newer soii release too, so the notice is current when this answers.
    // The check is a single git call; a slow one is left to finish in the background rather than hold Sync up.
    if (env.local && version) {
      version.ensureStarted()
      await Promise.race([version.refresh(), new Promise(resolve => setTimeout(resolve, 3000))])
    }
    return c.json({ changed: result.changed, summary: result.summary })
  })

  app.post('/api/log', sameOrigin, async c => {
    const body = await c.req.json().catch(() => null)
    const result = await logNote(env, body, { git: opts.git ?? runGit, notes: () => store.index().notes })
    if (!result.ok) return c.json({ error: result.error, message: result.message, ...(result.path ? { path: result.path } : {}) }, result.status)
    const { path, mode, warning } = result
    return c.json({ path, mode, warning }, 201)
  })

  // Quick capture (Option-P): one note in the Inbox, named by the server.
  app.post('/api/capture', sameOrigin, async c => {
    const body = await c.req.json().catch(() => null)
    const result = await captureNote(env, body, opts.git ?? runGit)
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    return c.json({ path: result.path, warning: result.warning }, 201)
  })

  app.post('/api/notes/properties', sameOrigin, async c => {
    const body = await c.req.json().catch(() => null)
    const result = await editProperty(env, body, { git: opts.git ?? runGit, notes: () => store.index().notes })
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    const { path, warning } = result
    return c.json({ path, warning })
  })

  // ---- views (D101): add, filter/sort, remove a tab in soii.config.yml ----
  const viewWrite = async (c: Context, parsed: { ok: true; req: ViewRequest } | { ok: false; status: 400; error: string; message: string }, created = false) => {
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400)
    const result = await editViews(env, parsed.req, { git: opts.git ?? runGit })
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    const { workspace, tabId, title, warning } = result
    return c.json({ workspace, tabId, title, warning }, created ? 201 : 200)
  }
  app.post('/api/views', sameOrigin, async c => viewWrite(c, parseAddRequest(await c.req.json().catch(() => null)), true))
  app.patch('/api/views/:workspace/:tab', sameOrigin, async c =>
    viewWrite(c, parseUpdateRequest(c.req.param('workspace'), c.req.param('tab'), await c.req.json().catch(() => null)))
  )
  app.delete('/api/views/:workspace/:tab', sameOrigin, async c =>
    viewWrite(c, { ok: true, req: { action: 'remove', workspace: c.req.param('workspace'), tabId: c.req.param('tab') } })
  )

  app.get('/api/search', c => {
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? 20) || 20))
    return c.json({ results: store.search(c.req.query('q') ?? '', limit) })
  })

  app.get('/api/files/*', c => serveFile(store, pathAfter(c, '/api/files/')))

  // ---- LaTeX (.tex viewer): compile an indexed .tex on click, local mode only ----
  app.get('/api/tex/*', async c => {
    const id = pathAfter(c, '/api/tex/')
    const doc = id === null ? null : store.note(id)
    if (!doc || doc.format !== 'tex') return c.json({ error: 'not_found' }, 404)
    if (!tex) return c.json({ error: 'tex_unavailable', message: 'LaTeX files compile in local mode only.' }, 501)
    const result = await tex.compile(doc.path)
    if (result.ok) {
      return new Response(Bun.file(result.pdf), {
        headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
      })
    }
    if (result.error === 'tex_failed') return c.json({ error: result.error, tool: result.tool, log: result.log }, 422)
    const status = result.error === 'tex_missing' ? 404 : result.error === 'tex_no_compiler' ? 503 : 504
    return c.json(result.error === 'tex_missing' ? { error: 'not_found' } : { error: result.error, message: result.message }, status)
  })

  // ---- extension mounts (Plan 2 adds `app.route('/api/cover', …)` on the line below) ----
  app.route('/api/cover', createCoverRoute({ secret: () => SIGNING_SECRET, googleBooksKey: () => source.GOOGLE_BOOKS_API_KEY, tmdbKey: () => source.TMDB_API_KEY }))

  app.notFound(c => c.json({ error: 'not_found' }, 404))
  app.onError((err, c) => {
    if (err instanceof VaultNotBuiltError) return c.json({ error: 'not_built' }, 503)
    console.error(err)
    return c.json({ error: 'internal' }, 500)
  })
  return app
}

