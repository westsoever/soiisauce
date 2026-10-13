// app/server/rates.ts
// Exchange rates for the Finance currency switch (D114). One request to the Frankfurter API
// (ECB reference rates, no key, no account) at most every 12 hours; any failure falls back to the
// last good answer, else to the built-in table. Nothing about the vault is ever sent.
import { FALLBACK_RATES, type Rates } from '../lib/currency'
import type { FetchLike } from './github-oauth'

const ENDPOINT = 'https://api.frankfurter.dev/v1/latest?base=EUR'
const FRESH_MS = 12 * 60 * 60_000
const RETRY_MS = 15 * 60_000
const TIMEOUT_MS = 5_000

export interface RatesProvider {
  get(): Promise<Rates>
}

function parse(body: unknown): Rates | null {
  if (!body || typeof body !== 'object') return null
  const { rates, date } = body as { rates?: unknown; date?: unknown }
  if (!rates || typeof rates !== 'object') return null
  const clean: Record<string, number> = {}
  for (const [code, rate] of Object.entries(rates)) {
    if (/^[A-Z]{3}$/.test(code) && code !== 'EUR' && typeof rate === 'number' && Number.isFinite(rate) && rate > 0) clean[code] = rate
  }
  // The ECB list always has DKK; an answer without it is not the answer we asked for.
  if (!clean.DKK) return null
  return { rates: clean, date: typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, source: 'live' }
}

export function createRatesProvider(deps: { fetch: FetchLike; now: () => number }): RatesProvider {
  let current: Rates = FALLBACK_RATES
  let nextTryAt = 0
  let inflight: Promise<Rates> | null = null

  async function refresh(): Promise<Rates> {
    try {
      const res = await deps.fetch(ENDPOINT, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      const parsed = res.ok ? parse(await res.json()) : null
      if (parsed) {
        current = parsed
        nextTryAt = deps.now() + FRESH_MS
        return current
      }
    } catch {
      // Offline, DNS, timeout: keep what we have.
    }
    nextTryAt = deps.now() + RETRY_MS
    return current
  }

  return {
    get() {
      if (deps.now() < nextTryAt) return Promise.resolve(current)
      // One request at a time, however many pages ask at once.
      inflight ??= refresh().finally(() => {
        inflight = null
      })
      return inflight
    }
  }
}
