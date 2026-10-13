import { describe, expect, test } from 'bun:test'
import { FALLBACK_RATES } from '../lib/currency'
import { createRatesProvider } from './rates'
import { createSoiiApp } from './app'
import { makeGeneratedFixture } from './test-fixture'

const live = { amount: 1, base: 'EUR', date: '2026-10-13', rates: { DKK: 7.4605, USD: 1.09, BAD: 'x' } }
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

function setup(responses: (() => Response | Promise<Response>)[]) {
  let t = 1_000_000
  let calls = 0
  const provider = createRatesProvider({
    now: () => t,
    fetch: async () => {
      const next = responses[Math.min(calls, responses.length - 1)]
      calls++
      return next()
    }
  })
  return { provider, calls: () => calls, advance: (ms: number) => void (t += ms) }
}

describe('createRatesProvider', () => {
  test('fetches once and keeps only well-formed rates', async () => {
    const s = setup([() => ok(live)])
    const rates = await s.provider.get()
    expect(rates).toEqual({ rates: { DKK: 7.4605, USD: 1.09 }, date: '2026-10-13', source: 'live' })
    await s.provider.get()
    expect(s.calls()).toBe(1)
  })

  test('asks again after twelve hours', async () => {
    const s = setup([() => ok(live), () => ok({ ...live, date: '2026-10-14' })])
    await s.provider.get()
    s.advance(12 * 60 * 60_000 + 1)
    expect((await s.provider.get()).date).toBe('2026-10-14')
  })

  test('concurrent callers share one request', async () => {
    const s = setup([() => ok(live)])
    await Promise.all([s.provider.get(), s.provider.get(), s.provider.get()])
    expect(s.calls()).toBe(1)
  })

  test('a failure gives the built-in table, and is retried after fifteen minutes, not on every call', async () => {
    const s = setup([() => Promise.reject(new Error('offline')), () => ok(live)])
    expect(await s.provider.get()).toEqual(FALLBACK_RATES)
    await s.provider.get()
    expect(s.calls()).toBe(1)
    s.advance(15 * 60_000 + 1)
    expect((await s.provider.get()).source).toBe('live')
  })

  test('a later failure keeps the last good rates', async () => {
    const s = setup([() => ok(live), () => new Response('nope', { status: 503 })])
    await s.provider.get()
    s.advance(12 * 60 * 60_000 + 1)
    expect((await s.provider.get()).date).toBe('2026-10-13')
  })

  test('an answer without DKK is rejected', async () => {
    const s = setup([() => ok({ rates: { USD: 1.1 } })])
    expect(await s.provider.get()).toEqual(FALLBACK_RATES)
  })
})

describe('GET /api/rates', () => {
  const dir = makeGeneratedFixture()
  test('returns the provider answer in local mode', async () => {
    const app = createSoiiApp({
      env: { SOII_LOCAL: '1', VAULT_PATH: '/tmp/none' },
      generatedDir: dir,
      fetch: async () => ok(live)
    })
    const res = await app.request('http://localhost:5011/api/rates', { headers: { Host: 'localhost:5011' } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { rates: Record<string, number> }).rates.DKK).toBe(7.4605)
  })
})
