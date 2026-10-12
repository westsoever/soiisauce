import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import type { NoteDoc, VaultIndex } from '../../lib/types'
import { keys } from '../lib/queries'
import { PersonHeader } from './PersonHeader'

const config = {
  workspaces: [{ id: 'people', title: 'People', tabs: [{ id: 'overview', title: 'Overview', view: 'pulse', query: {}, options: { cadence: { friend: 30 } } }] }]
}

function header(frontmatter: Record<string, unknown>): string {
  const client = new QueryClient()
  client.setQueryData(keys.vault, { config, notes: [] } as unknown as VaultIndex)
  const note = { id: 'People/Marvin', path: 'People/Marvin.md', title: 'Marvin', type: 'person', tags: [], frontmatter: { type: 'person', ...frontmatter } } as unknown as NoteDoc
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <PersonHeader note={note} />
    </QueryClientProvider>
  )
}

describe('PersonHeader reach out', () => {
  test('a friend without a cadence shows the default, marked as such', () => {
    const html = header({ relationship: 'friend' })
    expect(html).toContain('Reach out')
    expect(html).toContain('every month')
    expect(html).toContain('default')
  })

  test('their own cadence is shown without the default marker', () => {
    const html = header({ relationship: 'friend', cadence: 'quarterly' })
    expect(html).toContain('every 3 months')
    expect(html).not.toContain('default')
  })

  test('opted out and no cadence', () => {
    expect(header({ relationship: 'friend', cadence: 'never' })).toContain('never')
    expect(header({ relationship: 'contact' })).not.toContain('Reach out')
  })
})
