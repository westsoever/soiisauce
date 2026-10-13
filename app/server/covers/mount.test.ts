import { expect, test } from 'bun:test'
import { createSoiiApp } from '../app'
import { makeGeneratedFixture } from '../test-fixture'
import { SIGNING_SECRET } from '../env'
import { coverUrl } from './sign'

const app = createSoiiApp({ env: {}, generatedDir: makeGeneratedFixture() })

test('/api/cover only answers URLs soii signed: a forged request is 403', async () => {
  const res = await app.request('https://soii.test/api/cover?k=book&q=%7B%22title%22%3A%22A%22%7D&sig=AAAAAAAAAAAAAAAAAAAAAA')
  expect(res.status).toBe(403)
  expect(res.headers.get('cache-control')).toBe('no-store')
})

test('a cover URL signed with soii\'s secret verifies on the real app (no network for video)', async () => {
  const res = await app.request(`https://soii.test${coverUrl(SIGNING_SECRET, 'video', { url: 'https://youtu.be/dQw4w9WgXcQ' })}`)
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
})

