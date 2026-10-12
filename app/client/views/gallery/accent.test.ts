import { expect, test } from 'bun:test'
import { hashString, initials, pickAccent, TILE_ACCENTS } from './accent'

test('FNV-1a 32-bit known values', () => {
  expect(hashString('')).toBe(0x811c9dc5)
  expect(hashString('a')).toBe(0xe40c292c)
  expect(hashString('foobar')).toBe(0xbf9cf968)
})

test('pickAccent is deterministic and from the palette', () => {
  const a = pickAccent('The Dispossessed')
  expect(pickAccent('The Dispossessed')).toBe(a)
  expect(TILE_ACCENTS).toContain(a)
  const spread = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(pickAccent))
  expect(spread.size).toBeGreaterThan(2)
})

test('initials', () => {
  expect(initials('The Left Hand of Darkness')).toBe('LH')
  expect(initials('dune')).toBe('D')
  expect(initials('  ')).toBe('?')
  expect(initials('東京物語')).toBe('東')
  expect(initials('Ægir’s "Saga" & Co.')).toBe('ÆS')
  expect(initials('"Quoted" title')).toBe('QT')
  expect(initials('Salt & Pepper')).toBe('SP')
  expect(initials('Catch-22')).toBe('C')
  expect(initials('1984')).toBe('1')
  expect(initials('A & B')).toBe('B')
  expect(initials('& … !')).toBe('?')
})
