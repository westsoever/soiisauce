import { describe, expect, test } from 'bun:test'
import { CapacityOptionsSchema, computeCapacity, datedEntries, parseDatedEntry, pct, stateFor, withFelt } from './capacity'
import { resolveConfig } from './merge-config'
import { DEFAULT_CONFIG } from './default-config'
import { indexOf, note } from './life-test-utils'
import type { NoteMeta } from './types'

const TODAY = '2026-10-21'
const defaults = () => {
  const tab = DEFAULT_CONFIG.workspaces.find(w => w.id === 'capacity')!.tabs.find(t => t.id === 'load')!
  return CapacityOptionsSchema.parse(tab.options)
}

const vault = (extra: NoteMeta[] = []) => [
  note('02-Projects/Portfolio/README', { type: 'project', status: 'active' }),
  note('02-Projects/garden/raised-beds', { type: 'project', status: 'active', load: 25 }),
  note('02-Projects/cabin/README', { type: 'project', status: 'done' }),
  note('04-Resources/Backlog/Drive Cleanup', { status: 'doing' }),
  note('04-Resources/Backlog/Capacity tracker', { status: 'backlog' }),
  note('00-Inbox/Self esteem'),
  note('00-Inbox/WIN'),
  note('03-Areas/Leaks/Night sessions', { type: 'leak', verdict: 'fix', cost: 5 }),
  note('03-Areas/Leaks/RSVP backlog', { type: 'leak', verdict: 'accept', cost: '2' }),
  ...extra
]

const run = (notes: NoteMeta[], settings: NoteMeta | null = null, options = defaults()) =>
  computeCapacity(options, settings ? [settings] : [], indexOf(settings ? [...notes, settings] : notes), TODAY)

const byId = (result: ReturnType<typeof run>, id: string) => result.inputs.find(i => i.id === id)!

describe('computeCapacity with the built-in inputs', () => {
  test('counts notes by weight, and a note’s own number replaces the weight', () => {
    const result = run(vault())
    expect(byId(result, 'projects')).toMatchObject({ amount: 2, ownNumbers: 1, points: 15 + 25 })
    expect(byId(result, 'doing')).toMatchObject({ amount: 1, points: 5 })
    expect(byId(result, 'requests')).toMatchObject({ amount: 2, points: 2 })
    // Only accepted leaks cost capacity; a leak being fixed doesn't.
    expect(byId(result, 'leaks')).toMatchObject({ amount: 1, points: 2 })
    expect(result.total).toBe(49)
  })

  test('without a settings note the value inputs are not counted, and say why', () => {
    const result = run(vault())
    expect(byId(result, 'meetings')).toMatchObject({ points: null, missing: 'no-note' })
    expect(byId(result, 'base')).toMatchObject({ points: null, missing: 'no-note' })
    expect(result.felt).toEqual([])
    expect(result.settings).toBeNull()
  })

  test('the settings note feeds values and overrides weights, the line and the ceiling', () => {
    const settings = note('03-Areas/Capacity', {
      type: 'capacity',
      base: 20,
      meetings: ['2026-10-14: 30', '2026-10-21: 22.5'],
      weight_projects: 10,
      target: 75,
      ceiling: 110
    })
    const result = run(vault(), settings)
    expect(byId(result, 'meetings')).toMatchObject({ amount: 22.5, asOf: '2026-10-21', points: 45, missing: null })
    expect(byId(result, 'base')).toMatchObject({ amount: 20, points: 20 })
    expect(byId(result, 'projects')).toMatchObject({ weight: 10, points: 10 + 25 })
    expect(result.target).toBe(75)
    expect(result.ceiling).toBe(110)
    expect(result.total).toBe(35 + 5 + 2 + 2 + 45 + 20)
    expect(result.state).toBe('sprint')
  })

  test('a dated value older than maxAgeDays is stale and not counted; future entries are ignored', () => {
    const settings = note('Capacity', { type: 'capacity', meetings: ['2026-10-01: 30', '2026-10-30: 5'] })
    expect(byId(run(vault(), settings), 'meetings')).toMatchObject({ amount: 30, asOf: '2026-10-01', points: null, missing: 'stale' })
  })

  test('a settings note without the field says so', () => {
    const settings = note('Capacity', { type: 'capacity' })
    expect(byId(run(vault(), settings), 'meetings')).toMatchObject({ points: null, missing: 'no-value' })
  })

  test('the new-project answer: yes under the line, a push up to full, no above it', () => {
    const at = (base: number) => run([], note('Capacity', { type: 'capacity', base })).newProject!
    expect(at(60)).toEqual({ cost: 15, after: 75, verdict: 'yes' })
    expect(at(70)).toEqual({ cost: 15, after: 85, verdict: 'sprint' })
    expect(at(90)).toEqual({ cost: 15, after: 105, verdict: 'no' })
  })

  test('felt entries come from the settings note, oldest first', () => {
    const settings = note('Capacity', { type: 'capacity', felt: ['2026-10-21: felt 8, score 97%', { '2026-10-20': 6 }] })
    expect(run([], settings).felt).toEqual([
      { date: '2026-10-20', value: 6, score: null },
      { date: '2026-10-21', value: 8, score: 97 }
    ])
  })
})

describe('options', () => {
  test('the built-in options are valid, and an input needs a query or a value but not both', () => {
    expect(defaults().inputs.map(i => i.id)).toEqual(['projects', 'doing', 'requests', 'meetings', 'base', 'leaks'])
    expect(CapacityOptionsSchema.safeParse({ inputs: [{ id: 'x', label: 'X', weight: 1 }] }).success).toBe(false)
    expect(CapacityOptionsSchema.safeParse({ inputs: [{ id: 'x', label: 'X', weight: 1, value: 'a', query: { type: 'a' } }] }).success).toBe(false)
    expect(CapacityOptionsSchema.safeParse({ inputs: [{ id: 'x', label: 'X', weight: 1, value: 'a', wieght: 2 }] }).success).toBe(false)
  })

  test('a vault config with a capacity tab passes the config schema', () => {
    const config = resolveConfig({
      workspaces: [{ id: 'capacity', title: 'Capacity', tabs: [{ id: 'load', title: 'Load', view: 'capacity', query: { type: 'capacity' }, options: { inputs: [{ id: 'a', label: 'A', value: 'a', weight: 1 }] } }] }]
    })
    expect(config.workspaces.find(w => w.id === 'capacity')!.tabs[0].view).toBe('capacity')
  })
})

describe('dated entries', () => {
  test('strings and one-key maps, with an optional score', () => {
    expect(parseDatedEntry('2026-10-21: 12')).toEqual({ date: '2026-10-21', value: 12, score: null })
    expect(parseDatedEntry('2026-10-21 felt 8, score 97%')).toEqual({ date: '2026-10-21', value: 8, score: 97 })
    expect(parseDatedEntry('2026-10-21: 22,5 h')).toEqual({ date: '2026-10-21', value: 22.5, score: null })
    expect(parseDatedEntry({ '2026-10-21': 7 })).toEqual({ date: '2026-10-21', value: 7, score: null })
    expect(parseDatedEntry('yesterday: 7')).toBeNull()
    expect(parseDatedEntry(7)).toBeNull()
  })

  test('a later entry for the same day wins', () => {
    expect(datedEntries(['2026-10-21: 5', '2026-10-20: 4', '2026-10-21: 6']).map(e => e.value)).toEqual([4, 6])
    expect(datedEntries(undefined)).toEqual([])
  })

  test('withFelt replaces today and keeps the rest as written', () => {
    expect(withFelt(['2026-10-20: felt 6', '2026-10-21: felt 3, score 50%'], TODAY, 8, 96.6)).toEqual([
      '2026-10-20: felt 6',
      '2026-10-21: felt 8, score 97%'
    ])
    expect(withFelt([{ '2026-10-20': 6 }], TODAY, 8, 50)).toEqual(['2026-10-20: 6', '2026-10-21: felt 8, score 50%'])
    expect(withFelt(undefined, TODAY, 7, 80)).toEqual(['2026-10-21: felt 7, score 80%'])
  })
})

test('stateFor and pct', () => {
  expect([stateFor(80, 80, 100), stateFor(81, 80, 100), stateFor(101, 80, 100)]).toEqual(['under', 'sprint', 'over'])
  expect([pct(126.4), pct(2.5), pct(15)]).toEqual(['126%', '2.5%', '15%'])
})
