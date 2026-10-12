// Sessions without a database (spec §8.1): an HMAC-SHA256 signed cookie
// payload {login, avatarUrl, exp}, verified with crypto.subtle (constant time).
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { missingEnv, type SoiiEnv } from './env'

export interface SessionUser {
  login: string
  avatarUrl: string | null
}
export type AuthEnv = { Variables: { user: SessionUser } }

export const SESSION_COOKIE = 'soii_session'
export const OAUTH_COOKIE = 'soii_oauth'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

const encoder = new TextEncoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signValue(value: object, secret: string): Promise<string> {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload))
  return `${payload}.${Buffer.from(sig).toString('base64url')}`
}

export async function verifyValue<T extends { exp: number }>(token: string | undefined, secret: string, nowSeconds: number): Promise<T | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const sig = Buffer.from(parts[1], 'base64url')
  if (sig.length !== 32) return null
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, encoder.encode(parts[0]))
  if (!ok) return null
  try {
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as T
    return typeof value.exp === 'number' && value.exp > nowSeconds ? value : null
  } catch {
    return null
  }
}

export function createSessionToken(user: SessionUser, secret: string, nowSeconds: number): Promise<string> {
  return signValue({ login: user.login, avatarUrl: user.avatarUrl, exp: Math.floor(nowSeconds) + SESSION_MAX_AGE }, secret)
}

const firstValue = (header: string | undefined) => header?.split(',')[0]?.trim() || null

/**
 * The public origin of a request. Behind a proxy (Vercel) request.url can carry an internal
 * scheme/host, so x-forwarded-proto / x-forwarded-host win when present (first value if
 * comma-separated); anything that isn't a plain scheme or host[:port] is ignored.
 */
export function requestOrigin(c: Context): string {
  const url = new URL(c.req.url)
  const proto = firstValue(c.req.header('x-forwarded-proto'))?.toLowerCase()
  const host = firstValue(c.req.header('x-forwarded-host'))
  const scheme = proto === 'http' || proto === 'https' ? proto : url.protocol.slice(0, -1)
  const validHost = host && /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:]+\](:\d{1,5})?$/i.test(host) ? host : url.host
  return `${scheme}://${validHost}`
}

/** Secure cookies need https; plain http://localhost (dev) gets them without the flag. */
export function isHttps(c: Context): boolean {
  return requestOrigin(c).startsWith('https:')
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: isHttps(c), sameSite: 'Lax', path: '/', maxAge: SESSION_MAX_AGE })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: isHttps(c) })
}

export function requireUser(env: SoiiEnv, now: () => number): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    if (env.devAuth) {
      c.set('user', { login: 'dev', avatarUrl: null })
      return next()
    }
    const missing = missingEnv(env)
    if (missing.length) return c.json({ error: 'misconfigured', missing }, 500)
    const session = await verifyValue<SessionUser & { exp: number }>(getCookie(c, SESSION_COOKIE), env.sessionSecret ?? '', Math.floor(now() / 1000))
    if (!session || typeof session.login !== 'string' || !env.allowedLogins.includes(session.login.toLowerCase())) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    c.set('user', { login: session.login, avatarUrl: session.avatarUrl ?? null })
    await next()
  }
}
