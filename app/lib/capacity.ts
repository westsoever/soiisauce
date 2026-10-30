// The `capacity` view (D129): how full the week is, as a % of capacity, against a line you
// want to run at (80% by default). Load is a weighted sum of inputs: counts of notes (active
// projects, Inbox items, …) and numbers kept on one settings note (`type: capacity`), such as
// meeting hours or a fixed load. The settings note can also override the weights and the line,
// and holds the one daily self-report (`felt`). Pure and client-safe.
import { z } from 'zod'
import { querySchema } from './config-schema'
import { parseLooseNumber } from './format'
import { runTab } from './query'
import { readField } from './read-field'
import type { NoteMeta, VaultIndex } from './types'

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes')

const InputSchema = z
  .object({
    id: Id,
    label: z.string().min(1),
    /** Count the notes this query matches… */
    query: querySchema.optional(),
    /** …or read this field on the settings note: a number, or a list of dated entries ("2026-10-21: 12"). */
    value: z.string().min(1).optional(),
    /** % of capacity per note (query) or per unit (value). The settings note's `weight_<id>` wins. */
    weight: z.number(),
    /** Query inputs: a note's own number in this field replaces the weight for that note (`load: 30`). */
    field: z.string().min(1).optional(),
    /** Shown after the count, e.g. `h` for hours. */
    unit: z.string().min(1).optional(),
    /** One line on what the input counts. */
    hint: z.string().min(1).optional()
  })
  .strict()
  .refine(input => (input.query === undefined) !== (input.value === undefined), {
    message: 'needs either a query (count notes) or a value (a field on the settings note), not both'
  })

export const CapacityOptionsSchema = z
  .object({
    /** The line to run at, in %. The settings note's `target` wins. */
    target: z.number().positive().default(80),
    /** Full capacity, in %. Above it there is no slack left. The settings note's `ceiling` wins. */
    ceiling: z.number().positive().default(100),
    /** The input whose weight is the cost of one more project, for the "New project?" answer. */
    newProject: Id.default('projects'),
    /** Dated values older than this many days are not counted (they're stale). */
    maxAgeDays: z.number().int().positive().default(7),
    /** How the end-of-week outlook is worked out: which inputs are assumed cleared, and which field dates a note's end. */
    outlook: z
      .object({
        /** Inputs assumed to be at zero by the end of the week (the Inbox, if you file it weekly). */
        clear: z.array(Id).default(['requests']),
        /** A counted note whose date in this field falls in the rest of the week is assumed finished by the end of it. */
        dueField: z.string().min(1).default('due')
      })
      .strict()
      .default({ clear: ['requests'], dueField: 'due' }),
    inputs: z.array(InputSchema).min(1)
  })
  .strict()

export type CapacityInput = z.infer<typeof InputSchema>
export type CapacityOptions = z.infer<typeof CapacityOptionsSchema>

export interface DatedEntry {
  date: string
  value: number
  /** The computed score saved with a `felt` entry ("score 97%"), if any. */
  score: number | null
}

export interface InputResult {
  id: string
  label: string
  hint: string | null
  unit: string | null
  weight: number
  /** Notes counted (query inputs), or the value read (value inputs); null when there is nothing to read. */
  amount: number | null
  /** % of capacity this input adds; null = not counted. */
  points: number | null
  notes: NoteMeta[]
  /** Query inputs: what each counted note adds (its own number, or the weight). */
  loads: { note: NoteMeta; points: number }[]
  /** Query inputs: how many notes used their own number instead of the weight. */
  ownNumbers: number
  /** Value inputs: the date of the entry used, when the value is a dated list. */
  asOf: string | null
  /** Why it isn't counted: no settings note, field missing, or the newest entry is too old. */
  missing: 'no-note' | 'no-value' | 'stale' | null
}

export type CapacityState = 'under' | 'sprint' | 'over'
export type Verdict = 'yes' | 'sprint' | 'no'

export interface CapacityResult {
  settings: NoteMeta | null
  inputs: InputResult[]
  total: number
  target: number
  ceiling: number
  state: CapacityState
  /** The cost of one more project and where it would take the total. Null when `newProject` names no input. */
  newProject: { cost: number; after: number; verdict: Verdict } | null
  /** The daily self-report, oldest first. */
  felt: DatedEntry[]
}

const DATED = /^(\d{4}-\d{2}-\d{2})\D+?(-?\d+(?:[.,]\d+)?)/
const SCORE = /score\D{0,3}(\d+(?:[.,]\d+)?)/i

/**
 * One dated entry from a frontmatter list item. YAML reads an unquoted `- 2026-10-21: 12` as a
 * one-key map, so both that and the string "2026-10-21: 12" (or "2026-10-21 felt 8, score 97%") work.
 */
export function parseDatedEntry(raw: unknown): DatedEntry | null {
  let text: string
  if (typeof raw === 'string') text = raw
  else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const [entry] = Object.entries(raw as Record<string, unknown>)
    if (!entry) return null
    text = `${entry[0]}: ${String(entry[1])}`
  } else return null
  const match = DATED.exec(text.trim())
  if (!match) return null
  const value = Number(match[2].replace(',', '.'))
  if (!Number.isFinite(value)) return null
  const score = SCORE.exec(text.slice(match[0].length))
  return { date: match[1], value, score: score ? Number(score[1].replace(',', '.')) : null }
}

/** A list field's dated entries, oldest first; a later entry for the same day replaces an earlier one. */
export function datedEntries(value: unknown): DatedEntry[] {
  const byDay = new Map<string, DatedEntry>()
  for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) {
    const entry = parseDatedEntry(item)
    if (entry) byDay.set(entry.date, entry)
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** The settings note's number for `key`, if it has a readable one. */
function noteNumber(settings: NoteMeta | null, key: string): number | null {
  return settings ? parseLooseNumber(readField(settings, key)) : null
}

/** A value input's amount: a plain number, or the newest dated entry if it is recent enough. */
function readValue(settings: NoteMeta | null, field: string, today: string, maxAgeDays: number): Pick<InputResult, 'amount' | 'asOf' | 'missing'> {
  if (!settings) return { amount: null, asOf: null, missing: 'no-note' }
  const raw = readField(settings, field)
  const plain = Array.isArray(raw) ? null : parseLooseNumber(raw)
  if (plain !== null && !(typeof raw === 'string' && DATED.test(raw.trim()))) return { amount: plain, asOf: null, missing: null }
  const newest = datedEntries(raw).filter(e => e.date <= today).at(-1)
  if (!newest) return { amount: null, asOf: null, missing: 'no-value' }
  if (daysBetween(newest.date, today) > maxAgeDays) return { amount: newest.value, asOf: newest.date, missing: 'stale' }
  return { amount: newest.value, asOf: newest.date, missing: null }
}

export function stateFor(total: number, target: number, ceiling: number): CapacityState {
  if (total <= target) return 'under'
  return total <= ceiling ? 'sprint' : 'over'
}

export function computeCapacity(
  options: CapacityOptions,
  tabNotes: NoteMeta[],
  index: Pick<VaultIndex, 'notes' | 'config'>,
  today: string
): CapacityResult {
  // The settings note is the tab's first note (the tab's query picks it, `type: capacity` by default).
  const settings = tabNotes[0] ?? null
  const target = noteNumber(settings, 'target') ?? options.target
  const ceiling = noteNumber(settings, 'ceiling') ?? options.ceiling

  const inputs = options.inputs.map((input): InputResult => {
    const weight = noteNumber(settings, `weight_${input.id}`) ?? input.weight
    const base = { id: input.id, label: input.label, hint: input.hint ?? null, unit: input.unit ?? null, weight }
    if (input.query !== undefined) {
      const notes = runTab({ id: `__capacity-${input.id}`, title: '', view: 'list', query: input.query }, index)
      let points = 0
      let ownNumbers = 0
      const loads: InputResult['loads'] = []
      for (const note of notes) {
        const own = input.field ? parseLooseNumber(readField(note, input.field)) : null
        if (own !== null) ownNumbers++
        loads.push({ note, points: own ?? weight })
        points += own ?? weight
      }
      return { ...base, amount: notes.length, points, notes, loads, ownNumbers, asOf: null, missing: null }
    }
    const read = readValue(settings, input.value!, today, options.maxAgeDays)
    const points = read.missing === null && read.amount !== null ? read.amount * weight : null
    return { ...base, ...read, points, notes: [], loads: [], ownNumbers: 0 }
  })

  const total = inputs.reduce((sum, input) => sum + (input.points ?? 0), 0)
  const projectInput = inputs.find(input => input.id === options.newProject)
  const newProject = projectInput
    ? (() => {
        const after = total + projectInput.weight
        const verdict: Verdict = after <= target ? 'yes' : after <= ceiling ? 'sprint' : 'no'
        return { cost: projectInput.weight, after, verdict }
      })()
    : null

  return {
    settings,
    inputs,
    total,
    target,
    ceiling,
    state: stateFor(total, target, ceiling),
    newProject,
    felt: settings ? datedEntries(readField(settings, 'felt')) : []
  }
}

/** The Sunday that ends the week `today` falls in (today, when it is a Sunday). */
export function weekEnd(today: string): string {
  const day = new Date(`${today}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + ((7 - day.getUTCDay()) % 7))
  return day.toISOString().slice(0, 10)
}

/** A date field as YYYY-MM-DD, or null when it is missing or not a date. */
function dayOf(raw: unknown): string | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10)
  const match = typeof raw === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim()) : null
  return match ? match[1] : null
}

export interface OutlookStep {
  /** `clear`: an input assumed filed or emptied by the end of the week. `due`: notes whose date falls in the rest of the week. */
  kind: 'clear' | 'due'
  input: string
  label: string
  points: number
  notes: NoteMeta[]
}

export interface Outlook {
  weekEnd: string
  /** Where the load ends the week if the steps happen and nothing else changes. */
  projected: number
  state: CapacityState
  steps: OutlookStep[]
}

/**
 * Where the week ends. Only what the vault says is assumed: an input listed in `outlook.clear` is
 * emptied (the Inbox, filed weekly), and a counted note dated in the rest of the week (`due:`)
 * is finished. Meetings, the fixed load and accepted leaks stay as they are.
 */
export function computeOutlook(result: CapacityResult, options: CapacityOptions, today: string): Outlook {
  const end = weekEnd(today)
  const steps: OutlookStep[] = []
  for (const input of result.inputs) {
    if (input.loads.length === 0) continue
    if (options.outlook.clear.includes(input.id)) {
      steps.push({ kind: 'clear', input: input.id, label: input.label, points: input.points ?? 0, notes: input.notes })
      continue
    }
    const finishing = input.loads.filter(load => {
      const due = dayOf(readField(load.note, options.outlook.dueField))
      return due !== null && due >= today && due <= end
    })
    if (finishing.length > 0) {
      steps.push({
        kind: 'due',
        input: input.id,
        label: input.label,
        points: finishing.reduce((sum, load) => sum + load.points, 0),
        notes: finishing.map(load => load.note)
      })
    }
  }
  const projected = result.total - steps.reduce((sum, step) => sum + step.points, 0)
  return { weekEnd: end, projected, state: stateFor(projected, result.target, result.ceiling), steps }
}

export interface Cause {
  label: string
  points: number
  /** Share of the load now, 0 to 1. */
  share: number
}

export interface Action {
  input: string
  /** What to do, in a few words. */
  label: string
  notes: NoteMeta[]
  points: number
  /** The load at the end of the week once this and the actions before it are done. */
  after: number
}

export interface Advice {
  /** The biggest inputs now, largest first. */
  causes: Cause[]
  /** Points above the line at the end of the week (negative: below it). */
  over: number
  actions: Action[]
  /** Whether doing every action brings the end of the week to the line. */
  reaches: boolean
}

const CAUSES = 3
// Cheapest to undo first: file the Inbox, hand back work in progress, fix a leak, decline meetings, and only then pause a project.
const ORDER = ['requests', 'doing', 'leaks', 'meetings', 'projects'] as const

/**
 * What to cut to be at the line by the end of the week, from the notes and numbers already counted.
 * Largest first within a kind of cut, so the fewest actions get there. Only the built-in input ids
 * (`requests`, `doing`, `leaks`, `meetings`, `projects`) are advised on; others still count in the load.
 */
export function computeAdvice(result: CapacityResult, outlook: Outlook): Advice {
  const total = result.total
  const causes = result.inputs
    .filter(input => (input.points ?? 0) > 0)
    .sort((a, b) => b.points! - a.points!)
    .slice(0, CAUSES)
    .map(input => ({ label: input.label, points: input.points!, share: total > 0 ? input.points! / total : 0 }))

  const over = outlook.projected - result.target
  const gone = new Set(outlook.steps.flatMap(step => step.notes.map(note => note.id)))
  const actions: Action[] = []
  let left = over
  const push = (action: Omit<Action, 'after'>) => {
    left -= action.points
    actions.push({ ...action, after: result.target + left })
  }

  for (const id of ORDER) {
    if (left <= 0) break
    const input = result.inputs.find(candidate => candidate.id === id)
    if (!input) continue
    if (id === 'meetings') {
      const weight = input.weight
      if (input.points === null || input.amount === null || input.amount <= 0 || weight <= 0) continue
      const hours = Math.min(input.amount, Math.ceil(left / weight))
      push({ input: id, label: `Decline ${hours} hour${hours === 1 ? '' : 's'} of meetings`, notes: [], points: hours * weight })
      continue
    }
    const loads = input.loads
      .filter(load => !gone.has(load.note.id))
      .sort((a, b) => b.points - a.points || a.note.title.localeCompare(b.note.title))
    if (id === 'requests') {
      if (loads.length > 0) push({ input: id, label: 'File the Inbox', notes: loads.map(load => load.note), points: loads.reduce((sum, load) => sum + load.points, 0) })
      continue
    }
    const verb = id === 'doing' ? 'Move back to the backlog, or finish' : id === 'leaks' ? 'Fix the leak' : 'Pause the project'
    for (const load of loads) {
      if (left <= 0) break
      push({ input: id, label: verb, notes: [load.note], points: load.points })
    }
  }
  return { causes, over, actions, reaches: left <= 0 }
}

/** The `felt` list with today's entry set (replacing an earlier one for today), as the strings written back. */
export function withFelt(current: unknown, today: string, felt: number, score: number): string[] {
  const keep = (Array.isArray(current) ? current : current == null ? [] : [current]).filter(item => parseDatedEntry(item)?.date !== today)
  const asText = keep.map(item => {
    const entry = parseDatedEntry(item)
    return typeof item === 'string' || !entry ? String(item) : `${entry.date}: ${entry.value}`
  })
  return [...asText, `${today}: felt ${felt}, score ${Math.round(score)}%`]
}

/** Rounded for display: whole numbers, one decimal below 10 when it isn't whole. */
export function pct(n: number): string {
  const rounded = Math.abs(n) < 10 && !Number.isInteger(n) ? Math.round(n * 10) / 10 : Math.round(n)
  return `${rounded}%`
}
