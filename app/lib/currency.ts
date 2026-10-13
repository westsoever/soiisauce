// app/lib/currency.ts
// Currency conversion for the Finance views (D114). Rates are "units of currency per 1 EUR"
// (the ECB convention), so any pair converts through EUR. Pure: the server fetches the rates,
// the client picks the display currency, nothing here touches the network or the DOM.

export interface Rates {
  /** Units of each currency per 1 EUR. EUR itself is implicit (1). */
  rates: Record<string, number>
  /** The date the rates are from (YYYY-MM-DD), when the source says. */
  date: string | null
  /** `live` from the rate service, `fallback` built in (offline or the service failed). */
  source: 'live' | 'fallback'
}

/** Used until live rates arrive and whenever the rate service can't be reached. DKK is pegged to EUR; the rest are rough. */
export const FALLBACK_RATES: Rates = {
  rates: { DKK: 7.46, USD: 1.08, GBP: 0.85, SEK: 11.3, NOK: 11.6, CHF: 0.94 },
  date: null,
  source: 'fallback'
}

/** The currencies offered even when no note uses them. */
export const PRIMARY_CURRENCIES = ['EUR', 'DKK']

export interface CurrencyConfig {
  /** The currency Finance numbers are shown in until the reader picks another. */
  display?: string
  /** Your own rates (units per 1 EUR); they win over the live ones. */
  rates?: Record<string, number>
}

/** "dkk " → "DKK". Anything that isn't a three-letter code ("kr.") is not a currency we convert. */
export function currencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

function rateOf(rates: Record<string, number>, code: string): number | null {
  if (code === 'EUR') return 1
  const rate = rates[code]
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null
}

/** Converts `amount` from one currency to another; null when either currency has no rate. */
export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  const a = currencyCode(from)
  const b = currencyCode(to)
  if (!a || !b) return null
  if (a === b) return amount
  const fromRate = rateOf(rates, a)
  const toRate = rateOf(rates, b)
  return fromRate === null || toRate === null ? null : (amount / fromRate) * toRate
}

/** Your configured rates replace the live ones, code by code. Codes are upper-cased. */
export function withOverrides(base: Rates, overrides?: Record<string, number>): Rates {
  if (!overrides || !Object.keys(overrides).length) return base
  const rates = { ...base.rates }
  for (const [code, rate] of Object.entries(overrides)) {
    const key = currencyCode(code)
    if (key && key !== 'EUR' && Number.isFinite(rate) && rate > 0) rates[key] = rate
  }
  return { ...base, rates }
}

/** What the selector offers: EUR and DKK always, then every other currency the notes use that has a rate. */
export function currencyOptions(used: string[], rates: Record<string, number>): string[] {
  const options = [...PRIMARY_CURRENCIES]
  for (const code of [...new Set(used)].sort()) {
    if (!options.includes(code) && rateOf(rates, code) !== null) options.push(code)
  }
  return options
}

/** The currencies written in the notes' `currency` field, upper-cased, most used first. */
export function currenciesUsed(notes: { frontmatter: Record<string, unknown> }[]): string[] {
  const counts = new Map<string, number>()
  for (const note of notes) {
    const code = currencyCode(note.frontmatter.currency)
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code)
}

/** The currency numbers are shown in: the reader's choice, else the config's, else the most used one, else EUR. */
export function pickDisplay(options: { stored: string | null; configured?: string; used: string[] }): string | null {
  // `null` is the reader's own choice to see amounts as written.
  if (options.stored === 'original') return null
  return currencyCode(options.stored) ?? currencyCode(options.configured) ?? options.used[0] ?? 'EUR'
}

/** What a view needs to convert. Absent means "show amounts as written". */
export interface Conversion {
  to: string
  rates: Record<string, number>
}
