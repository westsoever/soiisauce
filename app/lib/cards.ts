// app/lib/cards.ts
// Flashcards written in notes, for `soii recall` (D130). Cards live only in a note's `## Cards` section, one per list
// item: `- Front :: Back` is one card, `- Front ::: Back` two (one each way), as in Obsidian's Spaced Repetition
// plugin. Only that section is read, because Dataview's `key:: value` fields use the same separator. Pure and
// client-safe, so an app view can use it later.

export interface Card {
  /** `path#hash`: the note and its normalised front, so editing the back keeps the card's schedule. */
  id: string
  /** The note's vault path, e.g. `03-Areas/Spanish.md`. */
  path: string
  front: string
  back: string
  /** The second card of a `:::` line: the back shown first. */
  reverse: boolean
}

const SECTION = /^##[ \t]+Cards[ \t]*#*[ \t]*$/i
// Any level 1 or 2 heading ends the section; a `### Sub` heading inside it doesn't.
const SECTION_END = /^#{1,2}[ \t]/
const FENCE = /^[ \t]*(```|~~~)/
const ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(.*)$/
// `::` or `:::` and no more colons. A separator with spaces around it wins, so `std::move :: …` splits at the spaced one.
const SPACED = /(?<=\s)(:{2,3})(?=\s)/
const BARE = /(?<!:)(:{2,3})(?!:)/

/** Lower case, NFC, one space between words: what has to change in a front before it counts as a new card. */
export const normaliseFront = (front: string) => front.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

// FNV-1a, 32 bits, as 8 hex digits. Only cards of the same note can collide, and a note holds tens of cards.
function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) h = Math.imul(h ^ byte, 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function cardId(path: string, front: string): string {
  return `${path}#${fnv1a(normaliseFront(front))}`
}

function splitCard(text: string): { front: string; back: string; both: boolean } | null {
  const m = SPACED.exec(text) ?? BARE.exec(text)
  if (!m) return null
  const front = text.slice(0, m.index).trim()
  const back = text.slice(m.index + m[1].length).trim()
  return front && back ? { front, back, both: m[1] === ':::' } : null
}

/**
 * The cards in a note's `## Cards` section(s), in the order written. Each section ends at the next `#` or `##` heading
 * or the end of the text. Lines that aren't list items, list items without a separator, and anything in a code fence
 * are skipped. A card whose id is already taken in this note (the same front twice) is skipped too.
 */
export function parseCards(markdown: string, path: string): Card[] {
  const cards: Card[] = []
  const seen = new Set<string>()
  const add = (front: string, back: string, reverse: boolean) => {
    const id = cardId(path, front)
    if (seen.has(id)) return
    seen.add(id)
    cards.push({ id, path, front, back, reverse })
  }
  let inSection = false
  let fence: string | null = null
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const f = FENCE.exec(line)
    if (fence) {
      if (f && f[1] === fence) fence = null
      continue
    }
    if (f) {
      fence = f[1]
      continue
    }
    if (SECTION.test(line)) inSection = true
    else if (SECTION_END.test(line)) inSection = false
    if (!inSection) continue
    const item = ITEM.exec(line)
    const card = item && splitCard(item[1])
    if (!card) continue
    add(card.front, card.back, false)
    if (card.both) add(card.back, card.front, true)
  }
  return cards
}
