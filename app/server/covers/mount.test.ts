import { expect, test } from 'bun:test'
import { createSoiiApp } from '../app'
import { makeGeneratedFixture } from '../test-fixture'
import { coverUrl } from './sign'

const SECRET = 'z'.repeat(40)
const ENV = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'csec', SOII_ALLOWED_GITHUB_LOGINS: 'octo', SOII_SESSION_SECRET: SECRET }
const app = createSoiiApp({ env: ENV, generatedDir: makeGeneratedFixture() })

test('/api/cover is public: forged request is 403 (signature), not 401 (session)', async () => {
  const res = await app.request('https://soii.test/api/cover?k=book&q=%7B%22title%22%3A%22A%22%7D&sig=AAAAAAAAAAAAAAAAAAAAAA')
  expect(res.status).toBe(403)
  expect(res.headers.get('cache-control')).toBe('no-store')
})

test('a cover URL signed with the session secret verifies on the real app (no network for video)', async () => {
  const res = await app.request(`https://soii.test${coverUrl(SECRET, 'video', { url: 'https://youtu.be/dQw4w9WgXcQ' })}`)
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
})

test('other API routes still need a session', async () => {
  const res = await app.request('https://soii.test/api/vault')
  expect(res.status).toBe(401)
})
