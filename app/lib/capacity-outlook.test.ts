import { describe, expect, test } from 'bun:test'
import { CapacityOptionsSchema, computeAdvice, computeCapacity, computeOutlook, weekEnd } from './capacity'
import { DEFAULT_CONFIG } from './default-config'
import { indexOf, note } from './life-test-utils'
import type { NoteMeta } from './types'

const TODAY = '2026-10-27' // a Tuesday; the week ends on Sunday 1 November
const defaults = () => {
  const tab = DEFAULT_CONFIG.workspaces.find(w => w.id === 'capacity')!.tabs.find(t => t.id === 'load')!
  return CapacityOptionsSchema.parse(tab.options)
}

const run = (notes: NoteMeta[], settings: NoteMeta | null = null, options = defaults()) => {
  const result = computeCapacity(options, settings ? [settings] : [], indexOf(settings ? [...notes, settings] : notes), TODAY)
  const outlook = computeOutlook(result, options, TODAY)
  return { result, outlook, advice: computeAdvice(result, outlook) }
}

const doing = (name: string, extra: Record<string, unknown> = {}) => note(`04-Resources/Backlog/${name}`, { status: 'doing', ...extra })
const project = (name: string, extra: Record<string, unknown> = {}) => note(`02-Projects/${name}/${name}`, { type: 'project', status: 'active', ...extra })

describe('weekEnd', () => {
  test('is the Sunday that ends the week, and a Sunday is its own', () => {
    expect(weekEnd('2026-10-26')).toBe('2026-11-01') // Monday
    expect(weekEnd('2026-10-27')).toBe('2026-11-01')
    expect(weekEnd('2026-11-01')).toBe('2026-11-01')
    expect(weekEnd('2026-12-30')).toBe('2027-01-03') // across a year
  })
})

describe('computeOutlook', () => {
  test('notes dated in the rest of the week finish and the Inbox is filed; the rest stays', () => {
    const { result, outlook } = run([
      project('Portfolio'),
      doing('Ends Thursday', { due: '2026-10-29' }),
      doing('Ends today', { due: new Date('2026-10-27T00:00:00Z') }),
      doing('Ends next week', { due: '2026-11-05' }),
      doing('Was due last week', { due: '2026-10-20' }),
      doing('No date'),
      note('00-Inbox/One'),
      note('00-Inbox/Two')
    ])
    expect(result.total).toBe(15 + 5 * 5 + 2)
    expect(outlook.weekEnd).toBe('2026-11-01')
    expect(outlook.steps.map(s => [s.kind, s.input, s.points])).toEqual([
      ['due', 'doing', 10],
      ['clear', 'requests', 2]
    ])
    expect(outlook.projected).toBe(result.total - 12)
  })

  test('an input can be left out of the cleared list, and a note’s own number is what finishes', () => {
    const options = CapacityOptionsSchema.parse({ ...DEFAULT_CONFIG.workspaces.find(w => w.id === 'capacity')!.tabs[0].options, outlook: { clear: [] } })
    const { result, outlook } = run([project('Big', { load: 30, due: '2026-10-30' }), note('00-Inbox/One')], null, options)
    expect(outlook.steps).toHaveLength(1)
    expect(outlook.steps[0]).toMatchObject({ kind: 'due', input: 'projects', points: 30 })
    expect(outlook.projected).toBe(result.total - 30)
  })

  test('with nothing dated and no Inbox the load stays where it is', () => {
    const { result, outlook } = run([project('Portfolio')])
    expect(outlook.steps).toEqual([])
    expect(outlook.projected).toBe(result.total)
    expect(outlook.state).toBe(result.state)
  })
})

describe('computeAdvice', () => {
  const heavy = (extra: NoteMeta[] = []) => [
    project('A'),
    project('B'),
    project('C'),
    doing('One'),
    doing('Two'),
    doing('Three', { load: 10 }),
    doing('Four'),
    note('00-Inbox/Idea'),
    note('00-Inbox/Other'),
    note('00-Inbox/Third'),
    ...extra
  ]
  const settings = note('03-Areas/Capacity', { type: 'capacity', meetings: ['2026-10-27: 20'] })

  test('names the biggest causes first', () => {
    const { result, advice } = run(heavy(), settings)
    expect(result.total).toBe(45 + 25 + 3 + 40)
    expect(advice.causes.map(c => c.label)).toEqual(['Active projects', 'Meetings, next 7 days', 'Backlog in progress'])
    expect(advice.causes[0].share).toBeCloseTo(45 / 113)
  })

  test('cuts the cheapest things first, largest within a kind, until the week is at the line', () => {
    const { outlook, advice } = run(heavy(), settings)
    // 113 now; the Inbox is assumed filed, so 110 by Sunday, 30 over the line.
    expect(outlook.projected).toBe(110)
    expect(advice.over).toBe(30)
    expect(advice.actions.map(a => [a.input, a.notes.map(n => n.title), a.points, a.after])).toEqual([
      ['doing', ['Three'], 10, 100],
      ['doing', ['Four'], 5, 95],
      ['doing', ['One'], 5, 90],
      ['doing', ['Two'], 5, 85],
      ['meetings', [], 6, 79]
    ])
    expect(advice.reaches).toBe(true)
  })

  test('does not advise on what the outlook already finishes or files', () => {
    const { advice } = run([doing('Ends soon', { due: '2026-10-29' }), ...heavy()], settings)
    expect(advice.actions.flatMap(a => a.notes.map(n => n.title))).not.toContain('Ends soon')
    expect(advice.actions.some(a => a.input === 'requests')).toBe(false)
  })

  test('files the Inbox first when it is not assumed cleared', () => {
    const options = CapacityOptionsSchema.parse({ ...DEFAULT_CONFIG.workspaces.find(w => w.id === 'capacity')!.tabs[0].options, outlook: { clear: [] } })
    const { advice } = run(heavy(), settings, options)
    expect(advice.actions[0]).toMatchObject({ input: 'requests', label: 'File the Inbox', points: 3 })
  })

  test('says so when the week ends under the line', () => {
    const { advice } = run([project('Portfolio')])
    expect(advice.over).toBeLessThan(0)
    expect(advice.actions).toEqual([])
    expect(advice.reaches).toBe(true)
  })

  test('a fixed load nothing here can cut leaves the line out of reach, and says so', () => {
    const { advice } = run([project('Portfolio')], note('03-Areas/Capacity', { type: 'capacity', base: 90 }))
    expect(advice.over).toBeGreaterThan(0)
    expect(advice.actions.map(a => a.input)).toEqual(['projects'])
    expect(advice.reaches).toBe(false)
  })
})
