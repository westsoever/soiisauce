import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CapacityOptionsSchema, computeCapacity } from '../../lib/capacity'
import { DEFAULT_CONFIG } from '../../lib/default-config'
import { indexOf, note } from '../../lib/life-test-utils'
import { Inputs, LoadPanel, NewProject } from './CapacityView'

const options = CapacityOptionsSchema.parse(DEFAULT_CONFIG.workspaces.find(w => w.id === 'capacity')!.tabs[0].options)
const checklist = note('Areas/New project - yes or no')
const settings = note('Areas/Capacity', { type: 'capacity', meetings: ['2026-10-21: 17.5'], checklist: '[[New project - yes or no]]' })
const notes = [note('P/Portfolio', { type: 'project', status: 'active' }), note('00-Inbox/Idea'), checklist, settings]
const result = computeCapacity(options, [settings], indexOf(notes), '2026-10-21')
const noop = () => {}

describe('CapacityView parts', () => {
  test('the load panel shows the score, the line and what it means', () => {
    const html = renderToStaticMarkup(<LoadPanel result={result} />)
    expect(html).toContain('51%')
    expect(html).toContain('role="meter"')
    expect(html).toContain('Under the 80% line, with 29% to spare.')
  })

  test('inputs list their notes as links and say why a value is not counted', () => {
    const html = renderToStaticMarkup(<Inputs inputs={result.inputs} openNote={noop} />)
    expect(html).toContain('href="/n/P/Portfolio"')
    expect(html).toContain('17.5 h × 2%')
    expect(html).toContain('Not counted: the capacity note has no base yet.')
  })

  test('the new-project answer links the checklist from the settings note', () => {
    const html = renderToStaticMarkup(<NewProject result={result} notes={notes} openNote={noop} />)
    expect(html).toContain('Yes, it fits: 51% → 66%, under the 80% line.')
    expect(html).toContain('Go through New project - yes or no')
  })
})
