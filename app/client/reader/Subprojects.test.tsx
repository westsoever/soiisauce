import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { note } from '../../lib/life-test-utils'
import type { NoteMeta, VaultIndex } from '../../lib/types'
import { keys } from '../lib/queries'
import { ParentTrail, Subprojects } from './Subprojects'

const project = (id: string, frontmatter: Record<string, unknown> = {}) => note(id, { type: 'project', ...frontmatter })

const garden = project('02-Projects/Balcony garden', { status: 'active' })
const beds = project('02-Projects/Raised beds', { status: 'active', parent: '[[Balcony garden]]', due: '2026-12-01', progress: 40 })
const legal = project('02-Projects/Legal setup', { status: 'done', parent: '[[Balcony garden]]' })
const vesting = project('02-Projects/Vesting', { status: 'idea', parent: '[[Raised beds]]' })
const notes = [garden, beds, legal, vesting]

function render(ui: ReactNode, vault: NoteMeta[] = notes): string {
  const client = new QueryClient()
  client.setQueryData(keys.vault, { config: {}, notes: vault } as unknown as VaultIndex)
  return renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('Subprojects', () => {
  test('lists the subprojects with status, due date and progress, and counts the done ones', () => {
    const html = render(<Subprojects note={garden} />)
    expect(html).toContain('Subprojects · 1 of 2 done')
    expect(html).toContain('href="/n/02-Projects/Raised%20beds"')
    expect(html).toContain('Legal setup')
    expect(html).toContain('>done<')
    expect(html).toContain('1 Dec 2026')
    expect(html).toContain('40%')
    // Open ones come before done ones, and only direct children are listed.
    expect(html.indexOf('Raised beds')).toBeLessThan(html.indexOf('Legal setup'))
    expect(html).not.toContain('Vesting')
  })

  test('shows nothing for a project without subprojects', () => {
    expect(render(<Subprojects note={legal} />)).toBe('')
  })
})

describe('ParentTrail', () => {
  test('shows the parents outermost first, each a link', () => {
    const html = render(<ParentTrail note={vesting} />)
    expect(html).toContain('aria-label="Parent projects"')
    expect(html.indexOf('Balcony garden')).toBeLessThan(html.indexOf('Raised beds'))
    expect(html).toContain('href="/n/02-Projects/Balcony%20garden"')
    expect(html).not.toContain('Vesting')
  })

  test('shows nothing without a parent, with a broken parent, or on a note that is not a project', () => {
    expect(render(<ParentTrail note={garden} />)).toBe('')
    const orphan = project('Orphan', { parent: '[[Nowhere]]' })
    expect(render(<ParentTrail note={orphan} />, [...notes, orphan])).toBe('')
    const plain = note('Plain', { parent: '[[Balcony garden]]' })
    expect(render(<ParentTrail note={plain} />, [...notes, plain])).toBe('')
  })

  test('a loop of parents still renders, ending where it repeats', () => {
    const a = project('A', { parent: '[[B]]' })
    const b = project('B', { parent: '[[A]]' })
    const html = render(<ParentTrail note={a} />, [a, b])
    expect(html).toContain('href="/n/B"')
    expect(html).not.toContain('href="/n/A"')
  })
})
