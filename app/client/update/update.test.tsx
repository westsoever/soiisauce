import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { VersionInfo } from '../../lib/types'
import { keys } from '../lib/queries'
import { UPDATE_COMMAND, updateMessage } from './messages'
import { UpdateNoticeRow } from './UpdateNotice'

const NEWER: VersionInfo = { installed: 'v0.1.2', latest: 'v0.1.3', updateAvailable: true, releaseUrl: 'https://github.com/westsoever/soiisauce/releases/tag/v0.1.3' }

function render(ui: ReactNode, info: VersionInfo | undefined): string {
  const client = new QueryClient()
  if (info) client.setQueryData(keys.version, info)
  return renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('updateMessage', () => {
  test('names both versions and the one thing to do', () => {
    expect(updateMessage(NEWER)).toBe('soii v0.1.3 is available (you have v0.1.2). Run soii update in a terminal.')
  })

  test('without a known installed version it still says what is available', () => {
    expect(updateMessage({ ...NEWER, installed: null })).toBe('soii v0.1.3 is available. Run soii update in a terminal.')
  })

  test('the command to copy is `soii update`, the one way to update', () => {
    expect(UPDATE_COMMAND).toBe('soii update')
  })
})

describe('UpdateNoticeRow', () => {
  test('shows an "Update available" row when a newer release exists', () => {
    const html = render(<UpdateNoticeRow />, NEWER)
    expect(html).toContain('Update available')
  })

  test('is absent when up to date', () => {
    expect(render(<UpdateNoticeRow />, { ...NEWER, latest: 'v0.1.2', updateAvailable: false })).toBe('')
  })

  test('is absent before the first answer and when the server has none (offline, not local)', () => {
    expect(render(<UpdateNoticeRow />, undefined)).toBe('')
    expect(render(<UpdateNoticeRow />, { installed: null, latest: null, updateAvailable: false, releaseUrl: null })).toBe('')
  })

  test('the row is a button, so keyboard and touch can open it as well as hover', () => {
    const html = render(<UpdateNoticeRow />, NEWER)
    expect(html).toMatch(/<button[^>]*type="button"/)
  })
})
