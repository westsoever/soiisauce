import { describe, expect, test } from 'bun:test'
import type { TabConfig } from '../../lib/types'
import { rateCaption, tabHasMoney, type CurrencyState } from './currency'

const tab = (view: TabConfig['view'], options?: Record<string, unknown>): TabConfig => ({ id: 't', title: 'T', view, query: {}, options })

describe('tabHasMoney', () => {
  test('stats tabs with money tiles or a money chart', () => {
    expect(tabHasMoney(tab('stats', { tiles: [{ label: 'x', agg: 'sum', field: 'balance' }] }))).toBe(true)
    expect(tabHasMoney(tab('stats', { tiles: [{ label: 'x', agg: 'sum', field: 'pages', format: 'currency' }] }))).toBe(true)
    expect(tabHasMoney(tab('stats', { tiles: [{ label: 'x', agg: 'count' }] }))).toBe(false)
    expect(tabHasMoney(tab('stats', { tiles: [], chart: { kind: 'bar', groupBy: 'category', agg: 'sum', field: 'amount', label: 'Spend' } }))).toBe(true)
  })
  test('table tabs with a currency column', () => {
    expect(tabHasMoney(tab('table', { columns: ['title', { field: 'price', format: 'currency' }] }))).toBe(true)
    expect(tabHasMoney(tab('table', { columns: ['title', 'price'] }))).toBe(false)
  })
  test('other views and broken options', () => {
    expect(tabHasMoney(tab('list'))).toBe(false)
    expect(tabHasMoney(tab('stats', { tilez: [] }))).toBe(false)
  })
})

describe('rateCaption', () => {
  const state = (display: string | null, source: 'live' | 'fallback'): CurrencyState => ({
    display,
    conversion: null,
    options: [],
    choose: () => {},
    rates: { rates: { DKK: 7.4605 }, date: '2026-10-13', source }
  })
  test('live rates show the rate and the date', () => {
    expect(rateCaption(state('DKK', 'live'))).toBe('1 EUR = 7.4605 DKK · ECB rates, 13 Oct 2026')
  })
  test('built-in rates say they are approximate', () => {
    expect(rateCaption(state('DKK', 'fallback'))).toBe('1 EUR = 7.4605 DKK · approximate rates')
  })
  test('EUR needs no rate line', () => {
    expect(rateCaption(state('EUR', 'live'))).toBe('ECB rates, 13 Oct 2026')
  })
})
