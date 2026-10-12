// Pure helpers for the People overview (the `pulse` view): when you last saw someone,
// how often you want to, and who is overdue. `lastSeen` is worked out at compile time
// (the body isn't in NoteMeta); everything relative to "now" runs in the browser so
// days-overdue stays right between vault rebuilds.
import { daysUntilBirthday } from './person'
import { asText } from './read-field'
import type { NoteMeta, SoiiConfig } from './types'

const DAY_MS = 86_400_000

/** "2026-09-14" when it is a real calendar date, else null. */
function isoDay(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? m[0] : null
}

// A list item that starts with a date: "- 2026-08-13: …", "* **2026-09-24**: …", "  - 2026-08-20/21: …".
const DATED_ITEM = /^\s*[-*+]\s+(?:\*\*|__)?(\d{4}-\d{2}-\d{2})/gm

/** The newest date that starts a list item in `body`, not after `today` (YYYY-MM-DD). */
export function latestDatedEntry(body: string, today: string): string | null {
  let latest: string | null = null
  for (const m of body.matchAll(DATED_ITEM)) {
    const day = isoDay(m[1])
    if (day && day <= today && (!latest || day > latest)) latest = day
  }
  return latest
}

/** NoteMeta.lastSeen: the newer of an ISO `last_contact` and the newest dated list item. Future dates don't count. */
export function computeLastSeen(frontmatter: Record<string, unknown>, body: string, today: string): string | null {
  const text = asText(frontmatter.last_contact)
  const contact = text ? isoDay(text) : null
  const fromBody = latestDatedEntry(body, today)
  const candidates = [contact, fromBody].filter((d): d is string => d !== null && d <= today)
  return candidates.length ? candidates.sort().at(-1)! : null
}

/** A LinkedIn profile URL from a full URL, `linkedin.com/in/x`, `in/x`, `@x` or a bare handle. Anything else → null. */
export function linkedinUrl(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  if (/^(https?:\/\/)?([\w-]+\.)*linkedin\.com\//i.test(text)) {
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`
    try {
      return new URL(url).protocol.startsWith('http') ? url : null
    } catch {
      return null
    }
  }
  const handle = /^(?:@|in\/)?([\w-]+)\/?$/.exec(text)
  return handle ? `https://www.linkedin.com/in/${handle[1]}` : null
}

/** "in/anna-berg" from a profile URL, for compact display. */
export function linkedinLabel(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, '') || 'LinkedIn'
  } catch {
    return 'LinkedIn'
  }
}

const CADENCE_WORDS: Record<string, number> = {
  weekly: 7,
  fortnightly: 14,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
  annually: 365
}
const OPT_OUT = new Set(['never', 'none', 'no', 'off', 'false', '0'])

/** `cadence` as written: a number of days, a word, an opt-out, or undefined when soii can't read it. */
export function ownCadence(value: unknown): number | null | undefined {
  if (value === false || value === 0) return null
  if (typeof value === 'number') return value > 0 ? value : undefined
  if (typeof value !== 'string') return undefined
  const s = value.trim().toLowerCase()
  if (OPT_OUT.has(s)) return null
  if (/^\d+$/.test(s)) return Number(s) > 0 ? Number(s) : null
  return CADENCE_WORDS[s]
}

export function isOptedOut(note: NoteMeta): boolean {
  return ownCadence(note.frontmatter.cadence) === null
}

/** Days between check-ins for the note's relationship(s) alone, the shortest when there are several. null = no default. */
export function relationshipCadence(note: NoteMeta, defaults: Record<string, number>): number | null {
  const rel = note.frontmatter.relationship
  const values = (Array.isArray(rel) ? rel : [rel]).map(asText).filter((v): v is string => v !== null)
  const lookup = new Map(Object.entries(defaults).map(([k, v]) => [k.trim().toLowerCase(), v]))
  const days = values.map(v => lookup.get(v.toLowerCase())).filter((d): d is number => d !== undefined)
  return days.length ? Math.min(...days) : null
}

/** Days between check-ins: the note's own `cadence`, else the shortest default for its relationship(s). null = no reminders. */
export function resolveCadence(note: NoteMeta, defaults: Record<string, number>): number | null {
  const own = ownCadence(note.frontmatter.cadence)
  return own !== undefined ? own : relationshipCadence(note, defaults)
}

/** The per-relationship defaults the People overview uses: the `cadence` option of the `pulse` tab(s). */
export function cadenceDefaults(config: SoiiConfig): Record<string, number> {
  const out: Record<string, number> = {}
  for (const tab of config.workspaces.flatMap(w => w.tabs)) {
    if (tab.view !== 'pulse') continue
    const map = tab.options?.cadence
    if (!map || typeof map !== 'object') continue
    for (const [key, days] of Object.entries(map)) if (typeof days === 'number' && days > 0) out[key.trim().toLowerCase()] = days
  }
  return out
}

/** `cadence` as it is written in frontmatter: "monthly" for 30, else the number of days. */
export function cadenceWord(days: number): string {
  const word = Object.entries(CADENCE_WORDS).find(([w, d]) => d === days && w !== 'biweekly' && w !== 'annually')
  return word ? word[0] : String(days)
}

/** The picker's value for a note's `cadence`: '' = not set (the relationship default applies), 'never', a word, days, or the text as written. */
export function cadenceChoice(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  const days = ownCadence(value)
  if (days === null) return 'never'
  if (days !== undefined) return cadenceWord(days)
  return asText(value) ?? ''
}

/** What the picker shows for a choice: "Every month", "Never remind me". */
export function cadenceChoiceLabel(choice: string): string {
  const days = ownCadence(choice)
  if (days === null) return 'Never remind me'
  if (days === undefined) return `${choice} (soii can't read this)`
  const label = cadenceLabel(days)
  return label[0].toUpperCase() + label.slice(1)
}

/** The Reach out line of a person's header: their own cadence, or the relationship default (inherited). null = no reminders set up. */
export function reachOut(note: NoteMeta, defaults: Record<string, number>): { label: string; inherited: boolean } | null {
  const own = ownCadence(note.frontmatter.cadence)
  if (own === null) return { label: 'never', inherited: false }
  if (own !== undefined) return { label: cadenceLabel(own), inherited: false }
  const days = relationshipCadence(note, defaults)
  return days === null ? null : { label: cadenceLabel(days), inherited: true }
}

/** Cadence words the picker offers, shortest first. */
export const CADENCE_CHOICES = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly', 'never']

/**
 * What to write as `cadence` when a note's relationship is set to `relationship`: that relationship's default,
 * once. A note that already has a cadence (even `never`) is never touched, so a hand-set cadence survives a
 * later change of relationship and nothing rechecks it.
 */
export function cadenceToStamp(note: NoteMeta, relationship: unknown, defaults: Record<string, number>): string | null {
  const own = note.frontmatter.cadence
  if (own !== undefined && own !== null && own !== '') return null
  const days = relationshipCadence({ ...note, frontmatter: { ...note.frontmatter, relationship } }, defaults)
  return days === null ? null : cadenceWord(days)
}

/** Whole calendar days from an ISO day to `now`, in the reader's timezone. */
export function daysSince(iso: string, now: Date): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const then = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - then) / DAY_MS)
}

export interface PulseOptions {
  cadence: Record<string, number>
  recentDays: number
}

export interface PulseRow {
  note: NoteMeta
  lastSeen: string | null
  daysSince: number | null
  cadence: number | null
}

export interface Pulse {
  reachOut: PulseRow[]
  recent: PulseRow[]
  birthdays: { note: NoteMeta; days: number }[]
  overdue: number
  neverLogged: number
}

const byTitle = (a: PulseRow, b: PulseRow) => a.note.title.localeCompare(b.note.title)

export function buildPulse(notes: NoteMeta[], options: PulseOptions, now: Date): Pulse {
  const rows: PulseRow[] = notes.map(note => {
    const lastSeen = note.lastSeen ?? null
    return { note, lastSeen, daysSince: lastSeen ? daysSince(lastSeen, now) : null, cadence: resolveCadence(note, options.cadence) }
  })

  // Overdue first, the most overdue relative to their cadence on top; then people never logged, shortest cadence first.
  const overdue = rows
    .filter(r => r.cadence !== null && r.daysSince !== null && r.daysSince > r.cadence)
    .sort((a, b) => b.daysSince! / b.cadence! - a.daysSince! / a.cadence! || byTitle(a, b))
  const never = rows.filter(r => r.cadence !== null && r.lastSeen === null).sort((a, b) => a.cadence! - b.cadence! || byTitle(a, b))

  const recent = rows
    .filter(r => r.daysSince !== null && r.daysSince <= options.recentDays)
    .sort((a, b) => a.daysSince! - b.daysSince! || byTitle(a, b))

  const birthdays = notes
    .filter(n => !isOptedOut(n))
    .map(n => ({ note: n, days: daysUntilBirthday(asText(n.frontmatter.birthday), now) }))
    .filter((b): b is { note: NoteMeta; days: number } => b.days !== null && b.days <= 30)
    .sort((a, b) => a.days - b.days || a.note.title.localeCompare(b.note.title))

  return { reachOut: [...overdue, ...never], recent, birthdays, overdue: overdue.length, neverLogged: never.length }
}

/** "today", "3 days ago", "5 weeks ago", "4 months ago", "2 years ago". */
export function agoLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  if (days < 730) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

/** "every week", "every 2 weeks", "every 3 months", "every 45 days". */
export function cadenceLabel(days: number): string {
  if (days === 1) return 'every day'
  if (days === 365) return 'every year'
  if (days % 30 === 0) return days === 30 ? 'every month' : `every ${days / 30} months`
  if (days % 7 === 0) return days === 7 ? 'every week' : `every ${days / 7} weeks`
  return `every ${days} days`
}
