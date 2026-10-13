import { describe, expect, test } from 'bun:test'
import { convertAmount, currenciesUsed, currencyCode, currencyOptions, FALLBACK_RATES, pickDisplay, withOverrides } from './currency'

const rates = { DKK: 7.5, USD: 1.2 }

describe('currencyCode', () => {
  test('accepts three letters in any case, rejects everything else', () => {
    expect(currencyCode(' dkk ')).toBe('DKK')
    expect(currencyCode('kr.')).toBeNull()
    expect(currencyCode('')).toBeNull()
    expect(currencyCode(5)).toBeNull()
  })
})

describe('convertAmount', () => {
  test('EUR to DKK and back', () => {
    expect(convertAmount(10, 'EUR', 'DKK', rates)).toBeCloseTo(75)
    expect(convertAmount(75, 'DKK', 'EUR', rates)).toBeCloseTo(10)
  })
  test('crosses through EUR', () => {
    expect(convertAmount(12, 'USD', 'DKK', rates)).toBeCloseTo(75)
  })
  test('same currency is returned as is, even without a rate', () => {
    expect(convertAmount(5, 'sek', 'SEK', {})).toBe(5)
  })
  test('null when a currency has no rate or is not a code', () => {
    expect(convertAmount(5, 'SEK', 'DKK', rates)).toBeNull()
    expect(convertAmount(5, 'kr.', 'DKK', rates)).toBeNull()
    expect(convertAmount(5, 'DKK', 'EUR', { DKK: 0 })).toBeNull()
  })
})

describe('withOverrides', () => {
  test('your rates replace the live ones and add new codes', () => {
    const merged = withOverrides({ ...FALLBACK_RATES, rates }, { dkk: 7.45, sek: 11 })
    expect(merged.rates).toEqual({ DKK: 7.45, USD: 1.2, SEK: 11 })
  })
  test('EUR and bad values are ignored', () => {
    expect(withOverrides({ ...FALLBACK_RATES, rates }, { EUR: 2, USD: -1, DKK: Number.NaN }).rates).toEqual(rates)
  })
  test('no overrides returns the same object', () => {
    const base = { ...FALLBACK_RATES, rates }
    expect(withOverrides(base)).toBe(base)
  })
})

describe('currencyOptions and currenciesUsed', () => {
  test('EUR and DKK first, then used currencies that have a rate', () => {
    expect(currencyOptions(['USD', 'SEK', 'DKK'], rates)).toEqual(['EUR', 'DKK', 'USD'])
  })
  test('counts the currency field case-insensitively, most used first', () => {
    const notes = [{ frontmatter: { currency: 'eur' } }, { frontmatter: { currency: 'DKK' } }, { frontmatter: { currency: 'DKK' } }, { frontmatter: {} }]
    expect(currenciesUsed(notes)).toEqual(['DKK', 'EUR'])
  })
})

describe('pickDisplay', () => {
  test('stored choice wins, then config, then most used, then EUR', () => {
    expect(pickDisplay({ stored: 'eur', configured: 'DKK', used: ['USD'] })).toBe('EUR')
    expect(pickDisplay({ stored: null, configured: 'dkk', used: ['USD'] })).toBe('DKK')
    expect(pickDisplay({ stored: null, used: ['USD'] })).toBe('USD')
    expect(pickDisplay({ stored: null, used: [] })).toBe('EUR')
  })
  test('"original" means no conversion', () => {
    expect(pickDisplay({ stored: 'original', configured: 'DKK', used: [] })).toBeNull()
  })
})
