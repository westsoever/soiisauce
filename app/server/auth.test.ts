// Tests for env checks, signed values, session cookies and requireUser (spec §8.1).
import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createSessionToken, requireUser, signValue, verifyValue, type AuthEnv } from './auth'
import { missingEnv, readEnv } from './env'

const SECRET = 'a'.repeat(40)
const NOW = 1_800_000_000_000
const env = readEnv({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec', SOII_ALLOWED_GITHUB_LOGINS: 'Octo, @second', SOII_SESSION_SECRET: SECRET })

function app(e = env, now = NOW) {
  const a = new Hono<AuthEnv>()
  a.get('/p', requireUser(e, () => now), c => c.json(c.get('user')))
  return a
}
const withCookie = (token: string) => ({ headers: { Cookie: `soii_session=${token}` } })

function envVars() {
  return { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec', SOII_ALLOWED_GITHUB_LOGINS: 'octo', SOII_SESSION_SECRET: SECRET }
}

describe('readEnv / missingEnv', () => {
  test('allowlist is trimmed, lowercased, @-stripped', () => {
    expect(env.allowedLogins).toEqual(['octo', 'second'])
    expect(missingEnv(env)).toEqual([])
  })
  test('lists every missing or short value by name only', () => {
    expect(missingEnv(readEnv({}))).toEqual(['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SOII_ALLOWED_GITHUB_LOGINS', 'SOII_SESSION_SECRET'])
    expect(missingEnv(readEnv({ ...envVars(), SOII_SESSION_SECRET: 'short' }))).toEqual(['SOII_SESSION_SECRET'])
  })
  test('dev auth only without VERCEL', () => {
    expect(readEnv({ SOII_DEV_AUTH: '1' }).devAuth).toBe(true)
    expect(readEnv({ SOII_DEV_AUTH: '1', VERCEL: '1' }).devAuth).toBe(false)
  })
})

describe('signed values', () => {
  test('round trip, expiry, tampering, wrong secret, garbage', async () => {
    const token = await signValue({ x: 1, exp: 100 }, SECRET)
    expect(await verifyValue<{ x: number; exp: number }>(token, SECRET, 99)).toEqual({ x: 1, exp: 100 })
    expect(await verifyValue(token, SECRET, 100)).toBeNull()
    const [payload, sig] = token.split('.')
    const forged = `${Buffer.from(JSON.stringify({ x: 2, exp: 100 })).toString('base64url')}.${sig}`
    expect(await verifyValue(forged, SECRET, 1)).toBeNull()
    expect(await verifyValue(`${payload}.${sig}x`, SECRET, 1)).toBeNull()
    expect(await verifyValue(token, 'b'.repeat(40), 1)).toBeNull()
    for (const junk of ['', '.', 'a.b.c', 'nodot', '%%%.%%%']) expect(await verifyValue(junk, SECRET, 1)).toBeNull()
  })
})

describe('requireUser', () => {
  test('no cookie → 401', async () => {
    const res = await app().request('/p')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  test('a valid session passes and exposes the user', async () => {
    const token = await createSessionToken({ login: 'Octo', avatarUrl: 'https://a/x.png' }, SECRET, NOW / 1000)
    const res = await app().request('/p', withCookie(token))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ login: 'Octo', avatarUrl: 'https://a/x.png' })
  })

  test('expired after 30 days', async () => {
    const token = await createSessionToken({ login: 'octo', avatarUrl: null }, SECRET, NOW / 1000)
    const later = NOW + 30 * 24 * 3600 * 1000 + 1000
    expect((await app(env, later).request('/p', withCookie(token))).status).toBe(401)
  })

  test('a login removed from the allowlist after sign-in is refused', async () => {
    const token = await createSessionToken({ login: 'mallory', avatarUrl: null }, SECRET, NOW / 1000)
    expect((await app().request('/p', withCookie(token))).status).toBe(401)
  })

  test('misconfigured env → 500 with the missing names', async () => {
    const res = await app(readEnv({ GITHUB_CLIENT_ID: 'id' })).request('/p')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'misconfigured', missing: ['GITHUB_CLIENT_SECRET', 'SOII_ALLOWED_GITHUB_LOGINS', 'SOII_SESSION_SECRET'] })
  })

  test('dev auth bypass', async () => {
    const res = await app(readEnv({ SOII_DEV_AUTH: '1' })).request('/p')
    expect(await res.json()).toEqual({ login: 'dev', avatarUrl: null })
  })
})
