// Tests for the GitHub OAuth flow and the auth routes (spec §8.1).
import { describe, expect, test } from 'bun:test'
import { createSoiiApp } from './app'
import { createSessionToken, signValue } from './auth'

const SECRET = 'k'.repeat(40)
const ENV = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'csec', SOII_ALLOWED_GITHUB_LOGINS: 'octo', SOII_SESSION_SECRET: SECRET }
const NOW = 1_800_000_000_000

function fakeGithub(login: string, fail = false) {
  return async (url: string) => {
    if (fail) return new Response('nope', { status: 500 })
    if (url.includes('access_token')) return Response.json({ access_token: 'gho_x' })
    return Response.json({ login, avatar_url: 'https://avatars/x.png' })
  }
}

const app = (login = 'octo', fail = false) =>
  createSoiiApp({ env: ENV, fetch: fakeGithub(login, fail), now: () => NOW, generatedDir: '/nonexistent' })

async function stateCookie(state: string) {
  return `soii_oauth=${await signValue({ state, exp: NOW / 1000 + 600 }, SECRET)}`
}

describe('auth routes', () => {
  test('health needs no session and leaks no vault content', async () => {
    const res = await app().request('https://soii.test/api/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, commit: null, vaultCommit: null, builtAt: null })
  })

  test('login redirects to GitHub with state, and sets a signed state cookie', async () => {
    const res = await app().request('https://soii.test/api/auth/login')
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(location.searchParams.get('client_id')).toBe('cid')
    expect(location.searchParams.get('redirect_uri')).toBe('https://soii.test/api/auth/callback')
    expect(location.searchParams.get('state')).toBeTruthy()
    expect(res.headers.get('set-cookie')).toContain('soii_oauth=')
    expect(res.headers.get('set-cookie')).toContain('Path=/api/auth')
  })

  test('callback with an allowed user sets the session and goes home', async () => {
    const res = await app().request('https://soii.test/api/auth/callback?code=c&state=s1', { headers: { Cookie: await stateCookie('s1') } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    const cookies = res.headers.get('set-cookie')!
    expect(cookies).toContain('soii_session=')
    expect(cookies).toContain('HttpOnly')
    expect(cookies).toContain('Secure')
    expect(cookies).toContain('SameSite=Lax')
  })

  test('callback rejects a wrong or missing state', async () => {
    const res = await app().request('https://soii.test/api/auth/callback?code=c&state=evil', { headers: { Cookie: await stateCookie('s1') } })
    expect(res.headers.get('location')).toBe('/?auth_error=state')
    const none = await app().request('https://soii.test/api/auth/callback?code=c&state=s1')
    expect(none.headers.get('location')).toBe('/?auth_error=state')
  })

  test('callback refuses logins not on the allowlist', async () => {
    const res = await app('mallory').request('https://soii.test/api/auth/callback?code=c&state=s1', { headers: { Cookie: await stateCookie('s1') } })
    expect(res.headers.get('location')).toBe('/?auth_error=not_allowed&login=mallory')
    expect(res.headers.get('set-cookie') ?? '').not.toContain('soii_session=ey')
  })

  test('GitHub failures land on auth_error=github', async () => {
    const res = await app('octo', true).request('https://soii.test/api/auth/callback?code=c&state=s1', { headers: { Cookie: await stateCookie('s1') } })
    expect(res.headers.get('location')).toBe('/?auth_error=github')
  })

  test('misconfigured: login and callback redirect with auth_error=misconfigured; /api/me lists names', async () => {
    const bare = createSoiiApp({ env: {}, generatedDir: '/nonexistent' })
    expect((await bare.request('https://soii.test/api/auth/login')).headers.get('location')).toBe('/?auth_error=misconfigured')
    const me = await bare.request('https://soii.test/api/me')
    expect(me.status).toBe(500)
    expect((await me.json()).missing).toContain('SOII_SESSION_SECRET')
  })

  test('me and logout', async () => {
    const token = await createSessionToken({ login: 'octo', avatarUrl: null }, SECRET, NOW / 1000)
    const me = await app().request('https://soii.test/api/me', { headers: { Cookie: `soii_session=${token}` } })
    expect(await me.json()).toEqual({ login: 'octo', avatarUrl: null })
    const out = await app().request('https://soii.test/api/auth/logout', { method: 'POST' })
    expect(out.status).toBe(204)
    expect(out.headers.get('set-cookie')).toContain('soii_session=;')
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('behind a proxy (x-forwarded-*)', () => {
  const login = (url: string, headers: Record<string, string> = {}) => app().request(url, { headers })

  test('http request.url + x-forwarded-proto https → Secure cookie and https redirect_uri', async () => {
    const res = await login('http://soii.test/api/auth/login', { 'x-forwarded-proto': 'https' })
    const location = new URL(res.headers.get('location')!)
    expect(location.searchParams.get('redirect_uri')).toBe('https://soii.test/api/auth/callback')
    expect(res.headers.get('set-cookie')).toContain('Secure')
    const cb = await app().request('http://soii.test/api/auth/callback?code=c&state=s1', {
      headers: { Cookie: await stateCookie('s1'), 'x-forwarded-proto': 'https' }
    })
    expect(cb.headers.get('set-cookie')).toContain('soii_session=')
    expect(cb.headers.get('set-cookie')).toMatch(/soii_session=[^;]*;.*Secure/)
  })

  test('x-forwarded-host overrides an internal host', async () => {
    const res = await login('http://10.0.0.5:3000/api/auth/login', { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'soii.example.com' })
    expect(new URL(res.headers.get('location')!).searchParams.get('redirect_uri')).toBe('https://soii.example.com/api/auth/callback')
  })

  test('comma-separated values use the first one', async () => {
    const res = await login('http://internal/api/auth/login', {
      'x-forwarded-proto': 'https, http',
      'x-forwarded-host': 'soii.example.com, internal.lb'
    })
    expect(new URL(res.headers.get('location')!).searchParams.get('redirect_uri')).toBe('https://soii.example.com/api/auth/callback')
    expect(res.headers.get('set-cookie')).toContain('Secure')
  })

  test('no forwarded headers: behaviour follows request.url', async () => {
    const plain = await login('http://localhost:13390/api/auth/login')
    expect(new URL(plain.headers.get('location')!).searchParams.get('redirect_uri')).toBe('http://localhost:13390/api/auth/callback')
    expect(plain.headers.get('set-cookie')).not.toContain('Secure')
    const secure = await login('https://soii.test/api/auth/login')
    expect(secure.headers.get('set-cookie')).toContain('Secure')
  })

  test('garbage forwarded values are ignored', async () => {
    const res = await login('https://soii.test/api/auth/login', { 'x-forwarded-proto': 'javascript', 'x-forwarded-host': 'evil.com/path?x=1' })
    expect(new URL(res.headers.get('location')!).searchParams.get('redirect_uri')).toBe('https://soii.test/api/auth/callback')
  })

  test('logout clears the session cookie with Secure when forwarded https', async () => {
    const out = await app().request('http://soii.test/api/auth/logout', { method: 'POST', headers: { 'x-forwarded-proto': 'https' } })
    expect(out.headers.get('set-cookie')).toContain('Secure')
  })
})
