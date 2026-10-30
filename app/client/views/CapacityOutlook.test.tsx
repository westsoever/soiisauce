import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CapacityOptionsSchema, computeAdvice, computeCapacity, computeOutlook } from '../../lib/capacity'
import { DEFAULT_CONFIG } from '../../lib/default-config'
import { indexOf, note } from '../../lib/life-test-utils'
import { Actions, Causes, LoadPanel } from './CapacityView'

const options = CapacityOptionsSchema.parse(DEFAULT_CONFIG.workspaces.find(w => w.id === 'capacity')!.tabs[0].options)
const today = '2026-10-27'
const settings = note('Areas/Capacity', { type: 'capacity', meetings: ['2026-10-27: 20'] })
const notes = [
  note('P/A', { type: 'project', status: 'active' }),
  note('P/B', { type: 'project', status: 'active' }),
  note('P/C', { type: 'project', status: 'active' }),
  note('04-Resources/Backlog/Task one', { status: 'doing' }),
  note('04-Resources/Backlog/Task two', { status: 'doing' }),
  note('00-Inbox/Idea'),
  settings
]
const compute = (list = notes) => {
  const result = computeCapacity(options, [settings], indexOf(list), today)
  const outlook = computeOutlook(result, options, today)
  return { result, outlook, advice: computeAdvice(result, outlook) }
}
const noop = () => {}

describe('Capacity outlook parts', () => {
  test('the bar shows now and the expected end of the week, with a line under each', () => {
    const { result, outlook } = compute()
    const html = renderToStaticMarkup(<LoadPanel result={result} outlook={outlook} />)
    expect(html).toContain('Expected by 1 Nov 2026')
    expect(html).toContain(`${Math.round(result.total)}%`)
    expect(html).toContain(`${Math.round(outlook.projected)}%`)
    expect(html.match(/role="meter"/g)).toHaveLength(2)
    expect(html).toContain('above the 80% line.')
  })

  test('without an outlook the panel is the single bar it was', () => {
    const { result } = compute()
    const html = renderToStaticMarkup(<LoadPanel result={result} />)
    expect(html.match(/role="meter"/g)).toHaveLength(1)
    expect(html).not.toContain('Expected by')
  })

  test('the causes name the biggest inputs and what is assumed by Sunday', () => {
    const { result, outlook, advice } = compute()
    const html = renderToStaticMarkup(<Causes result={result} outlook={outlook} advice={advice} openNote={noop} />)
    expect(html).toContain('What is causing this')
    expect(html).toContain('Active projects')
    expect(html).toContain('Inbox: filed by the end of the week (assumed).')
  })

  test('the actions list what to cut, with note links, and where it lands', () => {
    const { result, advice } = compute()
    const html = renderToStaticMarkup(<Actions result={result} advice={advice} openNote={noop} />)
    expect(html).toContain('To reach 80% by the end of the week')
    expect(html).toContain('Move back to the backlog, or finish')
    expect(html).toContain('href="/n/04-Resources/Backlog/Task%20one"')
    expect(html).toContain('Doing these lands the week at')
  })

  test('a week that ends under the line says there is nothing to cut', () => {
    const { result, advice } = compute([note('P/A', { type: 'project', status: 'active' }), settings])
    const html = renderToStaticMarkup(<Actions result={result} advice={advice} openNote={noop} />)
    expect(html).toContain('Nothing to cut')
  })
})
