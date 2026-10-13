// soii's API (spec §6.3): one Hono app, served by api/server.ts on Vercel and by
// app/serve.ts locally. Every route except health, auth/* and cover needs a session.
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { join } from 'node:path'
import { decodePath } from '../lib/paths'
import {
  clearSessionCookie,
  createSessionToken,
  isHttps,
  OAUTH_COOKIE,
  requestOrigin,
  requireUser,
  setSessionCookie,
  signValue,
  verifyValue,
  type AuthEnv
} from './auth'
import { createCoverRoute } from './covers/route'
import { applyDecorators } from './decorate'
import { editProperty } from './edit-properties'
import { editViews, parseAddRequest, parseUpdateRequest, type ViewRequest } from './edit-views'
import { missingEnv, readEnv, signingSecret } from './env'
import { serveFile } from './files'
import { authorizeUrl, exchangeCode, fetchGithubUser, type FetchLike } from './github-oauth'
import { logNote } from './log-note'
import { createRatesProvider } from './rates'
import { canSync, runGit, syncVault, type RunGit } from './sync'
import { createTexCompiler, type TexCompiler } from './tex'
import { createVersionChecker, gitLsRemote, type VersionChecker } from './version'
import { remoteFromEnv } from '../cli/vault-files'
import { hostHeaderAllowed } from './local'
import { createVaultStore, defaultGeneratedDir, VaultNotBuiltError, type VaultStore } from './vault-store'
import { writeNote, writeTarget } from './write-note'

export interface AppOptions {
  env?: Record<string, string | undefined>
  generatedDir?: string
  store?: VaultStore
  fetch?: FetchLike
  now?: () => number
  git?: RunGit
  /** Replaces the release check (tests). By default local mode checks soii's remote for a newer tag. */
  version?: VersionChecker
  /** LaTeX compiler (tests). Undefined: one over VAULT_PATH in local mode; null: none (hosted). */
  tex?: TexCompiler | null
}

/** The decoded rest of the raw (still percent-encoded) path after `prefix`, or null. */
function pathAfter(c: Context, prefix: string): string | null {
  const raw = new URL(c.req.url).pathname
  if (!raw.startsWith(prefix)) return null
  return decodePath(raw.slice(prefix.length))
}

export function createSoiiApp(opts: AppOptions = {}): Hono<AuthEnv> {
  const source = opts.env ?? process.env
  const env = readEnv(source)
  const now = opts.now ?? Date.now
  const seconds = () => Math.floor(now() / 1000)
  const fetchImpl: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init))
  const store = opts.store ?? createVaultStore(opts.generatedDir ?? defaultGeneratedDir(source))
  const tex = opts.tex !== undefined ? opts.tex : env.vaultPath ? createTexCompiler({ vaultDir: env.vaultPath, cacheDir: join(env.vaultPath, '.soii', 'cache', 'tex') }) : null
  const auth = requireUser(env, now)
  const rates = createRatesProvider({ fetch: fetchImpl, now })
  const version =
    opts.version ?? (env.local ? createVersionChecker({ installed: env.soiiVersion, lsRemote: gitLsRemote(remoteFromEnv(source), opts.git ?? runGit) }) : null)
  const app = new Hono<AuthEnv>()
  if (env.local && !env.localForce) {
    app.use('*', async (c, next) => (hostHeaderAllowed(c.req.header('host')) ? next() : c.json({ error: 'bad_host' }, 403)))
  }
  const callbackUrl = (c: Context) => `${requestOrigin(c)}/api/auth/callback`
  const decorateCtx = (c: Context) => ({ secret: signingSecret(env), origin: requestOrigin(c) })

  app.get('/api/health', c => {
    const meta = store.meta()
    return c.json({ ok: true, commit: meta?.commit ?? null, vaultCommit: meta?.vaultCommit ?? null, builtAt: meta?.builtAt ?? null })
  })

  // ---- auth ----
  app.get('/api/auth/login', async c => {
    if (env.devAuth) return c.redirect('/')
    if (missingEnv(env).length) return c.redirect('/?auth_error=misconfigured')
    const state = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')
    const token = await signValue({ state, exp: seconds() + 600 }, env.sessionSecret ?? '')
    setCookie(c, OAUTH_COOKIE, token, { httpOnly: true, secure: isHttps(c), sameSite: 'Lax', path: '/api/auth', maxAge: 600 })
    return c.redirect(authorizeUrl(env.githubClientId ?? '', callbackUrl(c), state))
  })

  app.get('/api/auth/callback', async c => {
    if (missingEnv(env).length) return c.redirect('/?auth_error=misconfigured')
    const code = c.req.query('code')
    const state = c.req.query('state')
    const saved = await verifyValue<{ state: string; exp: number }>(getCookie(c, OAUTH_COOKIE), env.sessionSecret ?? '', seconds())
    deleteCookie(c, OAUTH_COOKIE, { path: '/api/auth' })
    if (!code || !state || !saved || saved.state !== state) return c.redirect('/?auth_error=state')
    let user
    try {
      const token = await exchangeCode(
        { clientId: env.githubClientId ?? '', clientSecret: env.githubClientSecret ?? '', code, redirectUri: callbackUrl(c) },
        fetchImpl
      )
      user = await fetchGithubUser(token, fetchImpl)
    } catch (err) {
      console.error(err)
      return c.redirect('/?auth_error=github')
    }
    if (!env.allowedLogins.includes(user.login.toLowerCase())) {
      return c.redirect(`/?auth_error=not_allowed&login=${encodeURIComponent(user.login)}`)
    }
    setSessionCookie(c, await createSessionToken(user, env.sessionSecret ?? '', seconds()))
    return c.redirect('/')
  })

  app.post('/api/auth/logout', c => {
    clearSessionCookie(c)
    return c.body(null, 204)
  })

  app.get('/api/me', auth, c => c.json(c.get('user')))

  // The installed and the newest release, for the sidebar's "Update available". Only an installed (local mode) soii has
  // anything to update from; asking starts the checks, and serve.ts asks once at startup.
  app.get('/api/version', auth, c => {
    if (!env.local || !version) return c.json({ installed: null, latest: null, updateAvailable: false, releaseUrl: null })
    version.ensureStarted()
    return c.json(version.info())
  })

  // Exchange rates (units per 1 EUR) for the Finance currency switch; cached for hours, with a built-in fallback.
  app.get('/api/rates', auth, async c => c.json(await rates.get()))

  // ---- vault ----
  app.get('/api/vault', auth, c => {
    const index = store.index()
    const ctx = decorateCtx(c)
    return c.json({ ...index, notes: index.notes.map(n => applyDecorators(n, ctx)) })
  })

  app.get('/api/notes/*', auth, c => {
    const id = pathAfter(c, '/api/notes/')
    const doc = id === null ? null : store.note(id)
    if (!doc) return c.json({ error: 'not_found' }, 404)
    return c.json(applyDecorators(doc, decorateCtx(c)))
  })

  // ---- writing (Library "Add") and syncing ----
  // State-changing routes: a signed-in session isn't enough on its own, the request must come from soii itself.
  const sameOrigin: MiddlewareHandler<AuthEnv> = async (c, next) => {
    if (c.req.header('origin') !== requestOrigin(c)) return c.json({ error: 'bad_origin' }, 403)
    await next()
  }

  app.get('/api/capabilities', auth, c => c.json({ write: writeTarget(env) !== null, writeVia: writeTarget(env), sync: canSync(env) }))

  app.post('/api/notes', auth, sameOrigin, async c => {
    const body = await c.req.json().catch(() => null)
    const result = await writeNote(env, body, fetchImpl, opts.git)
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    return c.json({ path: result.path, via: result.via, commitUrl: result.commitUrl, warning: result.warning }, 201)
  })

  app.post('/api/sync', auth, sameOrigin, async c => {
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

  app.post('/api/log', auth, sameOrigin, async c => {
    const body = await c.req.json().catch(() => null)
    const result = await logNote(env, body, { fetch: fetchImpl, git: opts.git ?? runGit, notes: () => store.index().notes })
    if (!result.ok) return c.json({ error: result.error, message: result.message, ...(result.path ? { path: result.path } : {}) }, result.status)
    const { path, mode, via, commitUrl, pulled, warning } = result
    return c.json({ path, mode, via, commitUrl, pulled, warning }, 201)
  })

  app.post('/api/notes/properties', auth, sameOrigin, async c => {
    const body = await c.req.json().catch(() => null)
    const result = await editProperty(env, body, { fetch: fetchImpl, git: opts.git ?? runGit, notes: () => store.index().notes })
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    const { path, via, commitUrl, pulled, warning } = result
    return c.json({ path, via, commitUrl, pulled, warning })
  })

  // ---- views (D101): add, filter/sort, remove a tab in soii.config.yml ----
  const viewWrite = async (c: Context<AuthEnv>, parsed: { ok: true; req: ViewRequest } | { ok: false; status: 400; error: string; message: string }, created = false) => {
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400)
    const result = await editViews(env, parsed.req, { fetch: fetchImpl, git: opts.git ?? runGit })
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    const { workspace, tabId, title, via, commitUrl, warning } = result
    return c.json({ workspace, tabId, title, via, commitUrl, warning }, created ? 201 : 200)
  }
  app.post('/api/views', auth, sameOrigin, async c => viewWrite(c, parseAddRequest(await c.req.json().catch(() => null)), true))
  app.patch('/api/views/:workspace/:tab', auth, sameOrigin, async c =>
    viewWrite(c, parseUpdateRequest(c.req.param('workspace'), c.req.param('tab'), await c.req.json().catch(() => null)))
  )
  app.delete('/api/views/:workspace/:tab', auth, sameOrigin, async c =>
    viewWrite(c, { ok: true, req: { action: 'remove', workspace: c.req.param('workspace'), tabId: c.req.param('tab') } })
  )

  app.get('/api/search', auth, c => {
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? 20) || 20))
    return c.json({ results: store.search(c.req.query('q') ?? '', limit) })
  })

  app.get('/api/files/*', auth, c => serveFile(store, pathAfter(c, '/api/files/')))

  // ---- LaTeX (.tex viewer): compile an indexed .tex on click, local mode only ----
  app.get('/api/tex/*', auth, async c => {
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
  app.route('/api/cover', createCoverRoute({ secret: () => (missingEnv(env).length ? undefined : signingSecret(env)), googleBooksKey: () => source.GOOGLE_BOOKS_API_KEY, tmdbKey: () => source.TMDB_API_KEY }))

  app.notFound(c => c.json({ error: 'not_found' }, 404))
  app.onError((err, c) => {
    if (err instanceof VaultNotBuiltError) return c.json({ error: 'not_built' }, 503)
    console.error(err)
    return c.json({ error: 'internal' }, 500)
  })
  return app
}

export { restoreApiPath } from './rewrite'
