// soii's API (spec §6.3): one Hono app, served by api/server.ts on Vercel and by
// app/serve.ts locally. Every route except health, auth/* and cover needs a session.
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
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
import { missingEnv, readEnv, signingSecret } from './env'
import { serveFile } from './files'
import { authorizeUrl, exchangeCode, fetchGithubUser, type FetchLike } from './github-oauth'
import { logNote } from './log-note'
import { canSync, runGit, syncVault, type RunGit } from './sync'
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
  const auth = requireUser(env, now)
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
    const result = await writeNote(env, body, fetchImpl)
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
    return c.json({ path: result.path, via: result.via, commitUrl: result.commitUrl }, 201)
  })

  app.post('/api/sync', auth, sameOrigin, async c => {
    const result = await syncVault(env, opts.git, { push: env.local })
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status)
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

  app.get('/api/search', auth, c => {
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? 20) || 20))
    return c.json({ results: store.search(c.req.query('q') ?? '', limit) })
  })

  app.get('/api/files/*', auth, c => serveFile(store, pathAfter(c, '/api/files/')))

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
