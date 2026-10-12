// app/lib/paths.test.ts
import { describe, expect, test } from 'bun:test'
import { decodePath, encodePath, fileUrl, noteApiPath, notePath } from './paths'

describe('paths', () => {
  test('encodes each segment and keeps the slashes', () => {
    expect(encodePath('05-Knowledge/People/Anna')).toBe('05-Knowledge/People/Anna')
    expect(encodePath('Weird/Café & ? 100%')).toBe('Weird/Caf%C3%A9%20%26%20%3F%20100%25')
  })

  test('notePath, noteApiPath and fileUrl', () => {
    expect(notePath('Weird/Café & ? 100%')).toBe('/n/Weird/Caf%C3%A9%20%26%20%3F%20100%25')
    expect(notePath('Books/Dune', 'plot-summary')).toBe('/n/Books/Dune#plot-summary')
    expect(noteApiPath('a b/c')).toBe('/api/notes/a%20b/c')
    expect(fileUrl('assets/My Cover.png')).toBe('/api/files/assets/My%20Cover.png')
  })

  test('decodePath round-trips and rejects malformed escapes', () => {
    for (const id of ['plain', 'Weird/Café & ? 100%', 'a/b#c', '日本/ノート']) {
      expect(decodePath(encodePath(id))).toBe(id)
    }
    expect(decodePath('bad%E0%A4%A')).toBeNull()
    expect(decodePath('100%')).toBeNull()
  })
})
