// Tests for restoring the original /api path behind the Vercel rewrite.
import { describe, expect, test } from 'bun:test'
import { restoreApiPath } from './rewrite'

describe('restoreApiPath', () => {
  test('restores the original /api path and keeps other query params', () => {
    const req = restoreApiPath(new Request('https://soii.test/api/server?__soii_path=search&q=anna'))
    expect(new URL(req.url).pathname).toBe('/api/search')
    expect(new URL(req.url).search).toBe('?q=anna')
  })

  test('re-encodes each segment once, so unicode, spaces, ? and % survive', () => {
    const url = `https://soii.test/api/server?__soii_path=${encodeURIComponent('notes/Weird/Café & ? 100%')}`
    const req = restoreApiPath(new Request(url))
    expect(new URL(req.url).pathname).toBe('/api/notes/Weird/Caf%C3%A9%20%26%20%3F%20100%25')
  })

  test('leaves non-rewritten requests alone', () => {
    const original = new Request('https://soii.test/api/health')
    expect(restoreApiPath(original)).toBe(original)
  })
})
