// Deterministic accent for typographic tiles, picked from the theme's accent
// presets (ACCENTS in app/client/lib/theme.ts: paper … lavender).
import { ACCENTS } from '../../lib/theme'

export const TILE_ACCENTS: readonly string[] = Object.values(ACCENTS).filter((v): v is string => Boolean(v))

export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function pickAccent(title: string): string {
  return TILE_ACCENTS[hashString(title) % TILE_ACCENTS.length]
}

const ARTICLES = new Set(['the', 'a', 'an'])

// The first letter or digit of a word, so punctuation ("&", quotes, apostrophes) never becomes an initial.
const firstLetter = (word: string): string => word.match(/[\p{L}\p{N}]/u)?.[0] ?? ''

function lettersOf(words: string[]): string {
  return words
    .map(firstLetter)
    .filter(Boolean)
    .slice(0, 2)
    .map(c => c.toUpperCase())
    .join('')
}

export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  const meaningful = words.length > 1 && ARTICLES.has(words[0].toLowerCase()) ? words.slice(1) : words
  return lettersOf(meaningful) || lettersOf(words) || '?'
}
