import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { NoteMeta, VaultIndex } from '../../lib/types'
import type { Capabilities } from '../lib/queries'
import { keys } from '../lib/queries'
import { PropertiesPanel } from './PropertiesPanel'
import { CadenceField, PropertyField } from './PropertyEditor'

const marvin = {
  id: 'People/Marvin',
  path: 'People/Marvin.md',
  title: 'Marvin',
  type: 'person',
  tags: [],
  frontmatter: { type: 'person', relationship: 'friend', birthday: '1990-05-01', roles: ['founder', 'advisor'], kids: 2, vip: true, related: [['Anna']], title: 'Marvin' }
} as unknown as NoteMeta

const peopleConfig = {
  workspaces: [{ id: 'people', title: 'People', tabs: [{ id: 'overview', title: 'Overview', view: 'pulse', query: {}, options: { cadence: { friend: 30 } } }] }]
}

function render(ui: ReactNode, write: boolean): string {
  const client = new QueryClient()
  client.setQueryData(keys.vault, { config: peopleConfig, notes: [marvin] } as unknown as VaultIndex)
  client.setQueryData<Capabilities>(keys.capabilities, { write, sync: false })
  return renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('PropertiesPanel', () => {
  test('offers Edit only when soii can write', () => {
    expect(render(<PropertiesPanel note={marvin} />, true)).toContain('Edit')
    expect(render(<PropertiesPanel note={marvin} />, false)).not.toContain('Edit')
  })

  test('a note without properties shows the panel only when you could add some', () => {
    const bare = { ...marvin, frontmatter: {} } as NoteMeta
    expect(render(<PropertiesPanel note={bare} />, false)).toBe('')
    expect(render(<PropertiesPanel note={bare} />, true)).toContain('Properties')
  })
})

describe('PropertyField', () => {
  const field = (name: string) => render(<PropertyField note={marvin} name={name} value={marvin.frontmatter[name]}>shown</PropertyField>, true)

  test('text, dates and numbers get inputs with their value', () => {
    expect(field('relationship')).toContain('value="friend"')
    expect(field('birthday')).toMatch(/type="date"[^>]*value="1990-05-01"/)
    expect(field('kids')).toMatch(/inputMode="decimal"[^>]*value="2"/)
  })

  test('a list gets removable items; yes/no gets a switch', () => {
    const list = field('roles')
    expect(list).toContain('aria-label="Remove founder"')
    expect(list).toContain('aria-label="Remove advisor"')
    expect(field('vip')).toContain('role="switch"')
  })

  test('nested values and protected keys stay read-only', () => {
    expect(field('related')).toContain('Edit in Obsidian')
    expect(field('title')).toContain('Edit in Obsidian')
  })
})

describe('CadenceField', () => {
  const cadence = (cadenceValue?: unknown) => {
    const frontmatter = cadenceValue === undefined ? marvin.frontmatter : { ...marvin.frontmatter, cadence: cadenceValue }
    return render(<CadenceField note={{ ...marvin, frontmatter } as NoteMeta} />, true)
  }
  const selected = (html: string) => /<option value="([^"]*)" selected/.exec(html)?.[1]

  test('a friend without a cadence shows the relationship default as the first choice', () => {
    const html = cadence()
    expect(html).toContain('aria-label="Reach out"')
    expect(html).toContain('Default (every month)')
    expect(selected(html)).toBe('')
  })

  test('their own cadence is the selected choice', () => {
    expect(selected(cadence('quarterly'))).toBe('quarterly')
    expect(selected(cadence(14))).toBe('fortnightly')
    expect(selected(cadence('never'))).toBe('never')
  })

  test('a cadence soii has no word for stays selectable', () => {
    const html = cadence(45)
    expect(selected(html)).toBe('45')
    expect(html).toContain('Every 45 days')
  })

  test('someone without a relationship default is offered "no reminders" as the default', () => {
    const html = render(<CadenceField note={{ ...marvin, frontmatter: { type: 'person', relationship: 'contact' } } as NoteMeta} />, true)
    expect(html).toContain('Default (no reminders)')
  })
})
