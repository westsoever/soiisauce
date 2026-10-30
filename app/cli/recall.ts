// app/cli/recall.ts
// `soii recall …`: review the flashcards in the vault's `## Cards` sections in the shell, spaced over days by SM-2
// (D130). Cards are read from the notes and never written back. The answers go in `<vault>/.soii/cards.json`, saved
// after each one, and soii never commits that file.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCards, type Card } from '../lib/cards'
import { ConfigError } from '../lib/config-schema'
import { resolveConfig } from '../lib/merge-config'
import { isDue, sm2, type CardState, type Grade } from '../lib/srs'
import { loadConfig } from '../vault/compile'
import { isHiddenFlag, isHiddenYaml, parseFrontmatter, splitFrontmatter } from '../vault/frontmatter'
import { walkVault } from '../vault/walk'
import type { Flags } from './args'
import type { Ctx } from './context'
import { Aborted, type Prompter } from './prompt'
import { ArgError, vaultDir } from './vault-dir'

const USAGE = 'Usage: soii recall [review|list|due] [filter] (see `soii help`)'
/** New cards per review, after the due ones. */
export const NEW_PER_REVIEW = 10
export const STATE_FILE = '.soii/cards.json'
const GRADES = '1 again · 2 hard · 3 good · 4 easy · q quit '
const NO_CARDS = 'No cards yet. Add a "## Cards" section to a note, with lines like "- Front :: Back".'

/** `.soii/cards.json`. Entries for cards that are gone (a note moved, a front edited) are kept, never pruned. */
export interface CardsFile {
  version: 1
  cards: Record<string, unknown>
}

/** A wrong or newer `.soii/cards.json`: the command stops (exit 1) rather than overwrite someone's review history. */
class StateError extends Error {}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const DAY = /^\d{4}-\d{2}-\d{2}$/
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Every card in the vault, note by note in path order. Hidden notes and `exclude` are skipped, as in the app. */
export function readDeck(vault: string): Card[] {
  let exclude: string[]
  try {
    exclude = loadConfig(vault).exclude
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    exclude = resolveConfig({}).exclude
  }
  const { markdown, fsPaths } = walkVault(vault, exclude)
  const cards: Card[] = []
  for (const path of markdown) {
    const source = readFileSync(join(vault, fsPaths.get(path) ?? path), 'utf8')
    if (!/^##[ \t]+cards/im.test(source)) continue // most notes have none: don't parse their YAML
    const { data, body, error } = parseFrontmatter(source)
    if (error ? isHiddenYaml(splitFrontmatter(source).yaml ?? '') : isHiddenFlag(data.soii, data.publish)) continue
    cards.push(...parseCards(body, path))
  }
  return cards
}

export function readState(vault: string): CardsFile {
  const file = join(vault, STATE_FILE)
  if (!existsSync(file)) return { version: 1, cards: {} }
  let data: { version?: unknown; cards?: unknown } | null
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new StateError(`${STATE_FILE} is not valid JSON. Fix it or move it away; soii won't overwrite it.`)
  }
  if (data?.version !== 1 || !data.cards || typeof data.cards !== 'object' || Array.isArray(data.cards)) {
    throw new StateError(`${STATE_FILE} is not a version 1 cards file (a newer soii may have written it). soii won't overwrite it.`)
  }
  return { version: 1, cards: data.cards as Record<string, unknown> }
}

/** Written whole to a temporary file and renamed, ids sorted, so a crash never leaves half a file and diffs stay small. */
function writeState(vault: string, state: CardsFile) {
  const file = join(vault, STATE_FILE)
  mkdirSync(join(vault, '.soii'), { recursive: true })
  const cards = Object.fromEntries(Object.entries(state.cards).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  writeFileSync(`${file}.tmp`, `${JSON.stringify({ version: 1, cards }, null, 2)}\n`)
  renameSync(`${file}.tmp`, file)
}

/** A card's saved state, or undefined when it has none or the entry is broken (then it starts over as new). */
export function stateOf(state: CardsFile, id: string): CardState | undefined {
  const s = state.cards[id] as Partial<CardState> | undefined
  if (!s || typeof s !== 'object' || !DAY.test(String(s.due)) || !DAY.test(String(s.last))) return undefined
  return [s.interval, s.ease, s.reps, s.lapses].every(n => typeof n === 'number' && Number.isFinite(n)) ? (s as CardState) : undefined
}

/** What a review shows: the due cards, the longest overdue first, then every new card in vault order. */
export function pick(cards: Card[], state: CardsFile, today: string): { due: Card[]; fresh: Card[] } {
  const dueOn = (c: Card) => stateOf(state, c.id)?.due ?? ''
  const due = cards.filter(c => isDue(stateOf(state, c.id), today)).sort((a, b) => (dueOn(a) < dueOn(b) ? -1 : dueOn(a) > dueOn(b) ? 1 : 0))
  return { due, fresh: cards.filter(c => !stateOf(state, c.id)) }
}

/** The first day after `today` a card is due, or null. */
function nextDue(cards: Card[], state: CardsFile, today: string): string | null {
  const days = cards.map(c => stateOf(state, c.id)?.due).filter((d): d is string => d !== undefined && d > today)
  return days.length ? days.sort()[0] : null
}

async function askGrade(p: Prompter): Promise<Grade | null> {
  for (;;) {
    const a = (await p.ask(GRADES)).toLowerCase()
    if (a === 'q') return null
    if (a === '1' || a === '2' || a === '3' || a === '4') return Number(a) as Grade
  }
}

async function review(ctx: Ctx, vault: string, cards: Card[], state: CardsFile, today: string, json: boolean): Promise<number> {
  const { due, fresh } = pick(cards, state, today)
  const queue = [...due, ...fresh.slice(0, NEW_PER_REVIEW)]
  if (!queue.length) {
    const next = nextDue(cards, state, today)
    ctx.out(json ? JSON.stringify({ reviewed: 0, left: 0, next }, null, 2) : `Nothing to review today.${next ? ` The next card is due ${next}.` : ''}`)
    return 0
  }
  const newCount = Math.min(fresh.length, NEW_PER_REVIEW)
  ctx.out(`${plural(due.length, 'card')} due and ${newCount} new${fresh.length > newCount ? ` (of ${fresh.length})` : ''}. Enter shows the answer; q quits.`)
  const p = ctx.prompter()
  let reviewed = 0
  try {
    for (const [i, card] of queue.entries()) {
      ctx.out(`\n${i + 1}/${queue.length} · ${card.path}`)
      ctx.out(card.front)
      if ((await p.ask('Enter to show the answer ')).toLowerCase() === 'q') break
      ctx.out(card.back)
      const grade = await askGrade(p)
      if (grade === null) break
      const next = sm2(stateOf(state, card.id), grade, today)
      state.cards[card.id] = next
      writeState(vault, state)
      reviewed++
      ctx.out(`Next: ${next.due} (in ${plural(next.interval, 'day')}).`)
    }
  } catch (err) {
    if (!(err instanceof Aborted)) throw err // Ctrl-C or the end of input: stop like q, the answers are saved
  } finally {
    p.close()
  }
  const left = queue.length - reviewed
  ctx.out(
    json
      ? JSON.stringify({ reviewed, left, next: nextDue(cards, state, today) }, null, 2)
      : `\nReviewed ${plural(reviewed, 'card')}${left ? `; ${left} left for later` : ''}.${reviewed ? ` Saved in ${STATE_FILE}.` : ''}`
  )
  return 0
}

export async function recall(ctx: Ctx, args: string[], flags: Flags, today = localDate()): Promise<number> {
  try {
    const [sub = 'review', ...rest] = args
    if (!['review', 'list', 'due'].includes(sub) || rest.length > 1) throw new ArgError(USAGE)
    const vault = vaultDir(ctx, flags)
    const filter = rest[0]?.toLowerCase()
    const deck = readDeck(vault)
    const cards = filter ? deck.filter(c => c.path.toLowerCase().includes(filter)) : deck
    const state = readState(vault)
    if (!cards.length && !flags.json) {
      ctx.out(deck.length ? `No cards in notes matching "${rest[0]}".` : NO_CARDS)
      return 0
    }

    if (sub === 'review') return await review(ctx, vault, cards, state, today, flags.json)

    if (sub === 'list') {
      const rows = cards.map(c => ({ id: c.id, note: c.path, front: c.front, back: c.back, reverse: c.reverse, due: stateOf(state, c.id)?.due ?? null }))
      const notes = new Set(cards.map(c => c.path)).size
      const text = [...rows.map(r => `${(r.due ?? 'new').padEnd(10)}  ${r.note}  ${r.front}`), `${plural(rows.length, 'card')} in ${plural(notes, 'note')}.`]
      ctx.out(flags.json ? JSON.stringify({ today, cards: rows }, null, 2) : text.join('\n'))
      return 0
    }

    // due
    const { due, fresh } = pick(cards, state, today)
    const perNote = new Map<string, { note: string; due: number; new: number }>()
    const row = (c: Card) => {
      if (!perNote.has(c.path)) perNote.set(c.path, { note: c.path, due: 0, new: 0 })
      return perNote.get(c.path)!
    }
    for (const c of due) row(c).due++
    for (const c of fresh) row(c).new++
    const notes = [...perNote.values()].sort((a, b) => (a.note < b.note ? -1 : 1))
    const next = nextDue(cards, state, today)
    const text = [
      ...notes.map(n => `${n.note}: ${n.due} due, ${n.new} new`),
      `Today: ${plural(due.length, 'card')} due and ${fresh.length} new (a review takes up to ${NEW_PER_REVIEW} new).${!due.length && next ? ` The next card is due ${next}.` : ''}`
    ]
    ctx.out(flags.json ? JSON.stringify({ today, due: due.length, new: fresh.length, next, notes }, null, 2) : text.join('\n'))
    return 0
  } catch (err) {
    if (err instanceof ArgError) {
      ctx.err(`soii recall: ${err.message}`)
      return 2
    }
    if (err instanceof StateError) {
      ctx.err(`soii recall: ${err.message}`)
      return 1
    }
    throw err
  }
}
