// app/cli/recall.test.ts
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Flags } from './args'
import { realCtx, type Ctx } from './context'
import { main } from './main'
import { scriptedPrompter } from './prompt'
import { cardId } from '../lib/cards'
import { recall, STATE_FILE } from './recall'

const TEMPLATE = join(import.meta.dir, '../../template')
const TODAY = '2026-10-24'
const SPANISH = `---
type: area
---
# Spanish

status:: learning

## Cards

- hola :: hello
- perro ::: dog
- gato :: cat
- rojo :: red
- verde :: green
- casa :: house

## Log
- 2026-10-20 — started
`
const RUST = `# Rust

## Cards
- \`Box<T>\` :: a value on the heap
- \`Rc<T>\` :: shared ownership, one thread
- \`Arc<T>\` :: shared ownership across threads
- \`?\` :: returns the error early
- \`impl Trait\` :: some type that implements Trait
`
const HIDDEN = `---
soii: hidden
---
## Cards
- secret :: never shown
`

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
beforeAll(() => {
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' })
})

/** Sam's sample vault plus 12 cards in two notes (7 + 5) and a hidden note with one, committed. */
function vault(): string {
  const d = mkdtempSync(join(tmpdir(), 'soii-recall-'))
  dirs.push(d)
  cpSync(TEMPLATE, d, { recursive: true })
  writeFileSync(join(d, '03-Areas', 'Spanish.md'), SPANISH)
  mkdirSync(join(d, '04-Resources', 'Code'), { recursive: true })
  writeFileSync(join(d, '04-Resources', 'Code', 'Rust.md'), RUST)
  writeFileSync(join(d, '00-Inbox', 'Private.md'), HIDDEN)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: d })
  execFileSync('git', ['add', '-A'], { cwd: d })
  execFileSync('git', ['commit', '-q', '-m', 'first'], { cwd: d })
  return d
}

function rig(answers: string[] = []) {
  const out: string[] = []
  const err: string[] = []
  const asked: string[] = []
  const ctx: Ctx = { ...realCtx(), out: m => out.push(m), err: m => err.push(m), prompter: () => scriptedPrompter(answers, asked) }
  return { ctx, out, err, asked, text: () => out.join('\n') }
}
const flags = (f: Partial<Flags>): Flags => ({ follow: false, samples: false, noService: false, help: false, json: false, ...f })

/** Every .md file in the vault, path → bytes. */
function markdown(root: string): Map<string, string> {
  const files = new Map<string, string>()
  const visit = (rel: string) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory() && e.name !== '.git') visit(p)
      else if (e.name.endsWith('.md')) files.set(p, readFileSync(join(root, p), 'base64'))
    }
  }
  visit('')
  return files
}

const saved = (v: string) => JSON.parse(readFileSync(join(v, STATE_FILE), 'utf8')) as { version: number; cards: Record<string, { due: string; interval: number; ease: number; reps: number; lapses: number; last: string }> }
/** Enter, then a grade, for each of `grades`. */
const answers = (...grades: string[]) => grades.flatMap(g => ['', g])

describe('soii recall', () => {
  test('list --json shows every card, new ones with due: null; hidden notes and Dataview fields give none', async () => {
    const v = vault()
    const r = rig()
    expect(await recall(r.ctx, ['list'], flags({ vault: v, json: true }), TODAY)).toBe(0)
    const { cards } = JSON.parse(r.text()) as { cards: { note: string; front: string; due: string | null; reverse: boolean }[] }
    expect(cards).toHaveLength(12)
    expect(cards.every(c => c.due === null)).toBe(true)
    expect(cards.filter(c => c.note === '03-Areas/Spanish.md').map(c => c.front)).toEqual(['hola', 'perro', 'dog', 'gato', 'rojo', 'verde', 'casa'])
    expect(cards.find(c => c.front === 'dog')!.reverse).toBe(true)
    expect(cards.some(c => c.front === 'secret' || c.front === 'status')).toBe(false)
    const t = rig()
    expect(await recall(t.ctx, ['list', 'RUST'], flags({ vault: v }), TODAY)).toBe(0)
    expect(t.text()).toContain('new         04-Resources/Code/Rust.md  `Box<T>`')
    expect(t.text()).toEndWith('5 cards in 1 note.')
  })

  test('a review shows due cards then 10 new, saves after every answer, and writes no note and no commit', async () => {
    const v = vault()
    const before = markdown(v)
    const commits = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: v, encoding: 'utf8' })
    // again, easy, then good for the other eight new cards
    const r = rig(answers('1', '4', '3', '3', '3', '3', '3', '3', '3', '3'))
    expect(await recall(r.ctx, [], flags({ vault: v }), TODAY)).toBe(0)
    expect(r.text()).toContain('0 cards due and 10 new (of 12).')
    expect(r.out).toContain('hola')
    expect(r.out).toContain('hello')
    expect(r.asked.filter(q => q === '1 again · 2 hard · 3 good · 4 easy · q quit ')).toHaveLength(10)
    const state = saved(v)
    expect(state.version).toBe(1)
    expect(Object.keys(state.cards)).toHaveLength(10)
    expect(Object.values(state.cards).every(s => s.due === '2026-10-25' && s.interval === 1 && s.last === TODAY)).toBe(true)
    expect(state.cards[cardId('03-Areas/Spanish.md', 'hola')]).toMatchObject({ reps: 0, lapses: 1, ease: 2.5 })
    expect(state.cards[cardId('03-Areas/Spanish.md', 'perro')]).toMatchObject({ reps: 1, lapses: 0, ease: 2.6 })
    expect(markdown(v)).toEqual(before)
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: v, encoding: 'utf8' })).toBe(commits)

    // The next day the ten are due, the longest overdue first, and good moves them 6 days on.
    const next = rig(answers(...Array(12).fill('3')))
    expect(await recall(next.ctx, ['review'], flags({ vault: v }), '2026-10-25')).toBe(0)
    expect(next.text()).toContain('10 cards due and 2 new.')
    const after = Object.values(saved(v).cards)
    expect(after).toHaveLength(12)
    expect(after.filter(s => s.due === '2026-10-31')).toHaveLength(9) // the again card is at reps 1 again: 1 day
    expect(after.filter(s => s.due === '2026-10-26')).toHaveLength(3)
    expect(markdown(v)).toEqual(before)
  })

  test('due cards come oldest first, before the new ones', async () => {
    const v = vault()
    const day = (due: string) => ({ due, interval: 6, ease: 2.5, reps: 2, lapses: 0, last: '2026-10-01' })
    mkdirSync(join(v, '.soii'), { recursive: true })
    writeFileSync(join(v, STATE_FILE), JSON.stringify({ version: 1, cards: { [cardId('03-Areas/Spanish.md', 'casa')]: day('2026-10-22'), [cardId('04-Resources/Code/Rust.md', '`?`')]: day('2026-10-20'), [cardId('03-Areas/Spanish.md', 'gato')]: day('2026-11-01') } }))
    const r = rig(answers('3', '3', '3'))
    await recall(r.ctx, [], flags({ vault: v }), TODAY)
    expect(r.text()).toContain('2 cards due and 9 new.') // gato isn't due until November
    const shown = r.out.filter(l => ['`?`', 'casa', 'hola'].includes(l))
    expect(shown).toEqual(['`?`', 'casa', 'hola'])
  })

  test('a second review the same day shows only the new cards over the cap, then nothing', async () => {
    const v = vault()
    await recall(rig(answers(...Array(10).fill('3'))).ctx, [], flags({ vault: v }), TODAY)
    const again = rig(answers('3', '3'))
    expect(await recall(again.ctx, [], flags({ vault: v }), TODAY)).toBe(0)
    expect(again.text()).toContain('0 cards due and 2 new.')
    expect(again.asked.filter(q => q.startsWith('Enter'))).toHaveLength(2)
    const third = rig()
    expect(await recall(third.ctx, [], flags({ vault: v }), TODAY)).toBe(0)
    expect(third.text()).toBe('Nothing to review today. The next card is due 2026-10-25.')
    expect(third.asked).toEqual([])
  })

  test('q stops the review and keeps what was saved; so does the end of input', async () => {
    const v = vault()
    const r = rig(['', '3', 'q'])
    expect(await recall(r.ctx, [], flags({ vault: v }), TODAY)).toBe(0)
    expect(Object.keys(saved(v).cards)).toHaveLength(1)
    expect(r.text()).toContain('Reviewed 1 card; 9 left for later. Saved in .soii/cards.json.')
    // q at the grade leaves that card new
    await recall(rig(['', 'q']).ctx, [], flags({ vault: v }), TODAY)
    expect(Object.keys(saved(v).cards)).toHaveLength(1)
    // an answer that isn't a grade is asked again; then the input runs out (Ctrl-C works the same)
    const out = rig(['', 'x', '2'])
    expect(await recall(out.ctx, [], flags({ vault: v }), TODAY)).toBe(0)
    expect(out.asked.filter(q => q.startsWith('1 again'))).toHaveLength(2)
    expect(Object.keys(saved(v).cards)).toHaveLength(2)
  })

  test('the filter matches part of the note path, ignoring case', async () => {
    const v = vault()
    const r = rig(answers('3', '3', '3', '3', '3'))
    expect(await recall(r.ctx, ['review', 'code/rust'], flags({ vault: v }), TODAY)).toBe(0)
    expect(r.text()).toContain('0 cards due and 5 new.')
    expect(Object.keys(saved(v).cards).every(id => id.startsWith('04-Resources/Code/Rust.md#'))).toBe(true)
    const none = rig()
    expect(await recall(none.ctx, ['list', 'french'], flags({ vault: v }), TODAY)).toBe(0)
    expect(none.text()).toBe('No cards in notes matching "french".')
  })

  test('due gives the number due and new per note', async () => {
    const v = vault()
    await recall(rig(answers('3', '3', '3')).ctx, ['review', 'spanish'], flags({ vault: v }), TODAY)
    const r = rig()
    expect(await recall(r.ctx, ['due'], flags({ vault: v, json: true }), '2026-10-25')).toBe(0)
    expect(JSON.parse(r.text())).toEqual({
      today: '2026-10-25',
      due: 3,
      new: 9,
      next: null,
      notes: [
        { note: '03-Areas/Spanish.md', due: 3, new: 4 },
        { note: '04-Resources/Code/Rust.md', due: 0, new: 5 }
      ]
    })
    const t = rig()
    expect(await recall(t.ctx, ['due'], flags({ vault: v }), TODAY)).toBe(0)
    expect(t.text()).toContain('03-Areas/Spanish.md: 0 due, 4 new')
    expect(t.text()).toContain('Today: 0 cards due and 9 new (a review takes up to 10 new). The next card is due 2026-10-25.')
  })

  test('a broken cards.json stops the command and is left as it was', async () => {
    const v = vault()
    mkdirSync(join(v, '.soii'), { recursive: true })
    writeFileSync(join(v, STATE_FILE), '{"version":1,"cards":')
    const r = rig(answers('3'))
    expect(await recall(r.ctx, [], flags({ vault: v }), TODAY)).toBe(1)
    expect(r.err.join('\n')).toContain('is not valid JSON')
    expect(readFileSync(join(v, STATE_FILE), 'utf8')).toBe('{"version":1,"cards":')
    writeFileSync(join(v, STATE_FILE), '{"version":2,"cards":{}}')
    expect(await recall(rig().ctx, ['list'], flags({ vault: v }), TODAY)).toBe(1)
  })

  test('no cards at all says how to write one', async () => {
    const v = vault()
    rmSync(join(v, '03-Areas', 'Spanish.md'))
    rmSync(join(v, '04-Resources', 'Code', 'Rust.md'))
    const r = rig()
    expect(await recall(r.ctx, [], flags({ vault: v }), TODAY)).toBe(0)
    expect(r.text()).toBe('No cards yet. Add a "## Cards" section to a note, with lines like "- Front :: Back".')
    expect(existsSync(join(v, STATE_FILE))).toBe(false)
  })

  test('bad arguments exit 2: an unknown option, subcommand or a second filter', async () => {
    const r = rig()
    expect(await main(['recall', '--bogus'], r.ctx)).toBe(2)
    expect(r.err.join('\n')).toContain('Unknown option "--bogus" for `soii recall`.')
    const v = vault()
    const u = rig()
    expect(await recall(u.ctx, ['frobnicate'], flags({ vault: v }), TODAY)).toBe(2)
    expect(u.err.join('\n')).toContain('Usage: soii recall [review|list|due] [filter]')
    expect(await recall(rig().ctx, ['list', 'a', 'b'], flags({ vault: v }), TODAY)).toBe(2)
  })
})
