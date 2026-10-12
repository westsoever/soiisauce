import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { NoteDoc, NoteMeta, VaultIndex } from '../../lib/types'
import type { Capabilities } from '../lib/queries'
import { keys } from '../lib/queries'
import { FeedEntry } from '../views/feed/FeedEntry'
import { FeedNav } from '../views/feed/FeedNav'
import { NoteReader } from './NoteReader'
import { OpenInObsidian } from './OpenInObsidian'

const note = { id: '01-Daily/daily_report/2026-10-12', path: '01-Daily/daily_report/2026-10-12.md', title: 'Daily brief' } as NoteMeta

/** A page whose vault index and note bodies are already loaded, so one synchronous render shows the final UI. */
function render(ui: ReactNode, obsidianVault: string | null = 'cos'): string {
  const client = new QueryClient()
  client.setQueryData(keys.vault, { config: { obsidianVault }, notes: [note] } as unknown as VaultIndex)
  const doc = { ...note, frontmatter: {}, tags: [], html: '<p>Hello</p>', headings: [], outgoing: [], backlinks: [] }
  client.setQueryData<Capabilities>(keys.capabilities, { write: false, writeVia: null, sync: false })
  client.setQueryData(keys.note(note.id), doc as unknown as NoteDoc)
  return renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('OpenInObsidian', () => {
  test('links to the note in its vault', () => {
    const html = render(<OpenInObsidian path="05-Knowledge/People/Anna.md" />)
    expect(html).toContain('href="obsidian://open?vault=cos&amp;file=05-Knowledge%2FPeople%2FAnna.md"')
    expect(html).toContain('Open in Obsidian')
  })

  test('is absent when there is no vault name to build a link from', () => {
    expect(render(<OpenInObsidian path="05-Knowledge/People/Anna.md" />, null)).not.toContain('Open in Obsidian')
  })

  test('is absent when the note has no path yet', () => {
    expect(render(<OpenInObsidian path={undefined} />)).not.toContain('Open in Obsidian')
  })
})

describe('where the button lives', () => {
  test('a feed entry (the Today workspace, several notes in a day) offers Open note, not Open in Obsidian', () => {
    const html = render(<FeedEntry note={note} showTitle openNote={() => {}} />)
    expect(html).toContain('Open note')
    expect(html).not.toContain('Open in Obsidian')
    expect(html).not.toContain('obsidian://')
  })

  test('a single-note day puts Open note beside the date heading, in Obsidian purple and underlined', () => {
    const nav = (openNote?: () => void) =>
      render(<FeedNav date="2026-10-12" heading="Monday, 12 October 2026" isToday newer={null} older={null} dates={['2026-10-12']} openNote={openNote} onSelect={() => {}} />)
    const html = nav(() => {})
    expect(html).toMatch(/Monday, 12 October 2026<\/h2><button[^>]*text-obsidian[^>]*underline[^>]*>Open note/)
    expect(nav()).not.toContain('Open note')
    expect(render(<FeedEntry note={note} showTitle={false} openNote={() => {}} />)).not.toContain('Open note')
  })

  test('the reader carries it in its top bar', () => {
    const html = render(<NoteReader id={note.id} />)
    expect(html).toContain('href="obsidian://open?vault=cos&amp;file=01-Daily%2Fdaily_report%2F2026-10-12.md"')
    expect(html).toContain('Open in Obsidian')
  })
})
