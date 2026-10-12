import { describe, expect, test } from 'bun:test'
import { computeChart, computeTile, formatTileValue, StatsOptionsSchema, tileFootnote, type TileSpec } from './stats'
import { DEFAULT_CONFIG } from './default-config'
import { indexOf, note } from './life-test-utils'

const MONTHLY = { field: 'cycle', factors: { weekly: 4.33, monthly: 1, yearly: 0.0833 } }

const subs = [
  note('f/icloud', { type: 'subscription', price: '25,00 kr.', currency: 'DKK', cycle: 'monthly', status: 'active' }),
  note('f/flow', { type: 'subscription', price: 29, currency: 'DKK', cycle: 'Monthly', status: 'active' }),
  note('f/vocab', { type: 'subscription', price: '99,00 kr.', currency: 'dkk', cycle: 'yearly', status: 'active' }),
  note('f/raycast', { type: 'subscription', price: '$96.00', currency: 'USD', cycle: 'yearly', status: 'active' }),
  note('f/ticket', { type: 'subscription', price: '~29,40 EUR', currency: 'EUR', cycle: 'semester', status: 'active' }),
  note('f/netflix', { type: 'subscription', price: 89, currency: 'DKK', cycle: 'monthly', status: 'cancelled' })
]
const accounts = [
  note('f/a1', { type: 'account', balance: '1,234.56', currency: 'USD' }),
  note('f/a2', { type: 'account', balance: '12.500,00', currency: 'DKK' }),
  note('f/a3', { type: 'account', balance: 2000, currency: 'DKK' }),
  note('f/a4', { type: 'account', balance: 'n/a', currency: 'DKK' })
]
const all = [...subs, ...accounts]
const index = indexOf(all)
const tile = (spec: TileSpec) => computeTile(spec, all, index)

describe('computeTile', () => {
  test('count with type and where', () => {
    const [t] = tile({ label: 'Active subscriptions', agg: 'count', type: 'subscription', where: { status: 'active' } })
    expect(t.value).toBe(5)
    expect(t.display).toBe('5')
  })

  test('monthly subscriptions: normalised, grouped by currency, unknown cycles not counted', () => {
    const tiles = tile({
      label: 'Monthly subscriptions', agg: 'sum', field: 'price', type: 'subscription',
      where: { status: 'active' }, normalize: MONTHLY, groupBy: 'currency', format: 'currency'
    })
    expect(tiles.map(t => t.label)).toEqual(['Monthly subscriptions · DKK', 'Monthly subscriptions · EUR', 'Monthly subscriptions · USD'])
    expect(tiles[0].value!).toBeCloseTo(25 + 29 + 99 * 0.0833, 4)
    expect(tiles[0].currency).toBe('DKK')
    expect(tiles[1].value).toBeNull()
    expect(tiles[1].skipped).toBe(1)
    expect(tiles[1].display).toBe('—')
    expect(tiles[2].value!).toBeCloseTo(96 * 0.0833, 4)
  })

  test('net balance: locale number formats, unparseable values not counted', () => {
    const tiles = tile({ label: 'Net balance', agg: 'sum', field: 'balance', type: 'account', groupBy: 'currency', format: 'currency' })
    const dkk = tiles.find(t => t.currency === 'DKK')!
    const usd = tiles.find(t => t.currency === 'USD')!
    expect(dkk.value).toBe(14500)
    expect(dkk.skipped).toBe(1)
    expect(usd.value).toBeCloseTo(1234.56, 2)
  })

  test('auto-splits mixed currencies instead of adding them together', () => {
    const tiles = tile({ label: 'Balance', agg: 'sum', field: 'balance', type: 'account' })
    expect(tiles.map(t => t.currency).sort()).toEqual(['DKK', 'USD'])
    expect(tiles.every(t => t.format === 'currency')).toBe(true)
  })

  test('grouping by another field still splits mixed currencies inside each group', () => {
    const tiles = tile({ label: 'Spend', agg: 'sum', field: 'price', type: 'subscription', groupBy: 'status' })
    expect(tiles.map(t => t.label)).toEqual(['Spend · active · DKK', 'Spend · active · EUR', 'Spend · active · USD', 'Spend · cancelled'])
    expect(tiles.at(-1)!.value).toBe(89)
  })

  test.each([
    ['avg', 51],
    ['min', 25],
    ['max', 99]
  ] as const)('%s over DKK prices', (agg, expected) => {
    const [t] = tile({ label: agg, agg, field: 'price', type: 'subscription', where: { currency: 'DKK', status: 'active' } })
    expect(t.value).toBe(expected)
  })

  test('empty sets: field aggregates show "—", count shows 0', () => {
    const [sum] = tile({ label: 'Goals', agg: 'sum', field: 'progress', type: 'goal' })
    expect(sum.value).toBeNull()
    expect(sum.display).toBe('—')
    const [count] = tile({ label: 'Goals', agg: 'count', type: 'goal', groupBy: 'status' })
    expect(count.value).toBe(0)
    expect(count.display).toBe('0')
  })

  test('missing group values get a "no <field>" tile last', () => {
    const notes = [note('x/a', { type: 'account', balance: 5 }), note('x/b', { type: 'account', balance: 7, currency: 'EUR' })]
    const tiles = computeTile({ label: 'Bal', agg: 'sum', field: 'balance', groupBy: 'currency' }, notes, indexOf(notes))
    expect(tiles.map(t => t.label)).toEqual(['Bal · EUR', 'Bal · no currency'])
  })
})

describe('computeChart', () => {
  test('bars per group, largest first', () => {
    const points = computeChart({ kind: 'bar', groupBy: 'status', agg: 'count', label: 'By status' }, subs, indexOf(subs))
    expect(points).toEqual([
      { key: 'active', label: 'active', value: 5 },
      { key: 'cancelled', label: 'cancelled', value: 1 }
    ])
  })

  test('more than 12 groups fold the tail into "Other"', () => {
    const many = Array.from({ length: 15 }, (_, i) => note(`k/${i}`, { kind: `k${String(i).padStart(2, '0')}` }))
    const points = computeChart({ kind: 'bar', groupBy: 'kind', agg: 'count', label: 'Kinds' }, many, indexOf(many))
    expect(points).toHaveLength(12)
    expect(points.at(-1)).toEqual({ key: '\u0000other', label: 'Other', value: 4 })
  })
})

describe('formatting', () => {
  test('formatTileValue', () => {
    expect(formatTileValue(null, 'number', null)).toBe('—')
    expect(formatTileValue(1234.5, 'number', null)).toBe('1,234.5')
    expect(formatTileValue(5, 'number', null)).toBe('5')
    expect(() => formatTileValue(62.2467, 'currency', 'kr.')).not.toThrow()
    expect(formatTileValue(62.2467, 'currency', 'kr.')).toBe('62.25 kr.')
    expect(() => formatTileValue(62.2467, 'currency', 'DKK')).not.toThrow()
    expect(formatTileValue(62.2467, 'currency', 'DKK')).toContain('62')
  })

  test('tileFootnote', () => {
    const base = { label: 'x', value: 1, format: 'number' as const, currency: null, display: '1' }
    expect(tileFootnote({ ...base, count: 1, skipped: 0 })).toBe('1 note')
    expect(tileFootnote({ ...base, count: 3, skipped: 1 })).toBe('3 notes · 1 not counted')
  })
})

describe('StatsOptionsSchema', () => {
  test('sum without a field is rejected at tiles.0.field', () => {
    const result = StatsOptionsSchema.safeParse({ tiles: [{ label: 'Total', agg: 'sum' }] })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].path).toEqual(['tiles', 0, 'field'])
  })

  test('tiles default to an empty list', () => {
    expect(StatsOptionsSchema.parse({})).toEqual({ tiles: [] })
  })
})

describe('StatsOptionsSchema is strict (D42 R2)', () => {
  test('a typo at the top level is reported, not ignored', () => {
    const result = StatsOptionsSchema.safeParse({ tiles: [], chartt: {} })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].message).toContain('chartt')
  })

  test('a typo inside a tile or the chart is reported with its path', () => {
    const tile = StatsOptionsSchema.safeParse({ tiles: [{ label: 'x', agg: 'count', groupby: 'currency' }] })
    expect(tile.success).toBe(false)
    expect(tile.error!.issues[0].path).toEqual(['tiles', 0])
    const chart = StatsOptionsSchema.safeParse({ chart: { kind: 'bar', groupBy: 'k', agg: 'count', label: 'K', colour: 'red' } })
    expect(chart.success).toBe(false)
    expect(chart.error!.issues[0].path).toEqual(['chart'])
  })

  test("Core's default stats tabs still validate", () => {
    const tabs = DEFAULT_CONFIG.workspaces.flatMap(w => w.tabs).filter(t => t.view === 'stats')
    expect(tabs.length).toBeGreaterThan(0)
    for (const tab of tabs) expect(StatsOptionsSchema.safeParse(tab.options ?? {}).success).toBe(true)
  })
})

describe('computeChart never adds currencies together', () => {
  const chart = (rows: Record<string, unknown>[], agg: 'sum' | 'count' = 'sum') => {
    const notes = rows.map((fm, i) => note(`c/${i}`, fm))
    return computeChart({ kind: 'bar', groupBy: 'cat', agg, field: agg === 'count' ? undefined : 'price', label: 'x' }, notes, indexOf(notes))
  }

  test('a group with two currencies becomes one bar per currency', () => {
    const points = chart([{ cat: 'x', price: 10, currency: 'DKK' }, { cat: 'x', price: 5, currency: 'USD' }, { cat: 'y', price: 7, currency: 'dkk' }])
    expect(points.map(p => [p.label, p.value])).toEqual([['x · DKK', 10], ['y', 7], ['x · USD', 5]])
  })

  test('a group in a single currency, or with none, keeps its plain label', () => {
    expect(chart([{ cat: 'x', price: 10, currency: 'DKK' }, { cat: 'x', price: 5, currency: 'DKK' }, { cat: 'z', price: 1 }]).map(p => [p.label, p.value])).toEqual([
      ['x', 15],
      ['z', 1]
    ])
  })

  test('count charts are unaffected by currencies', () => {
    expect(chart([{ cat: 'x', currency: 'DKK' }, { cat: 'x', currency: 'USD' }], 'count').map(p => [p.label, p.value])).toEqual([['x', 2]])
  })

  test('"Other" is folded per currency, so it never mixes them either', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ cat: `k${String(i).padStart(2, '0')}`, price: 1, currency: i % 2 === 0 ? 'DKK' : 'USD' }))
    const points = chart(rows)
    const others = points.filter(p => p.label.startsWith('Other')).map(p => [p.label, p.value])
    expect(others).toEqual([['Other · USD', 2], ['Other · DKK', 1]])
    expect(points.some(p => p.label === 'Other')).toBe(false)
  })
})
