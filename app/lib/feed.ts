// Pure logic behind the feed view (spec §13): group dated notes into days,
// pick the day named by ?d=, step between days, and the "is there a note for
// today" check the tab badge uses. No React and no DOM — see feed.test.ts.
import { z } from 'zod'
import type { NoteMeta, Query, QueryClause, TabConfig } from './types'

export interface FeedDay {
  date: string
  notes: NoteMeta[]
}

export interface Feed {
  days: FeedDay[]
  undated: number
}

export interface FeedOptions {
  dateField?: string
}

// The error is a ZodError so FeedView can show it with Core's OptionsError like every other view (D36.6).
export type FeedOptionsResult = { ok: true; value: FeedOptions } | { ok: false; error: z.ZodError }

export const BRIEF_EMPTY = 'Briefs appear here when notes have `type: daily-brief` or live in a `daily_report` folder.'
export const GENERIC_EMPTY =
  'Notes appear here once they match this tab and have a date — a `date` in the frontmatter or a YYYY-MM-DD file name.'

const feedOptionsSchema = z.object({ dateField: z.string().trim().min(1).optional() }).strict()

export function parseFeedOptions(options: unknown): FeedOptionsResult {
  const parsed = feedOptionsSchema.safeParse(options ?? {})
  if (parsed.success) return { ok: true, value: { dateField: parsed.data.dateField } }
  return { ok: false, error: parsed.error }
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/

// "YYYY-MM-DD" for strings that start with a real calendar date, else null.
function toDay(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = ISO_DAY.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  const t = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (t.getUTCFullYear() !== Number(y) || t.getUTCMonth() !== Number(m) - 1 || t.getUTCDate() !== Number(d)) return null
  return `${y}-${m}-${d}`
}

const META_DATE_FIELDS = new Set(['date', 'updated'])

export function feedDate(note: NoteMeta, dateField?: string): string | null {
  const field = dateField ?? 'date'
  if (META_DATE_FIELDS.has(field)) return toDay(note[field as 'date' | 'updated'])
  return toDay(note.frontmatter[field])
}

function byTitle(a: NoteMeta, b: NoteMeta): number {
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
}

export function buildFeed(notes: NoteMeta[], dateField?: string): Feed {
  const byDate = new Map<string, NoteMeta[]>()
  let undated = 0
  for (const note of notes) {
    const date = feedDate(note, dateField)
    if (!date) {
      undated++
      continue
    }
    const list = byDate.get(date)
    if (list) list.push(note)
    else byDate.set(date, [note])
  }
  const days = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => ({ date, notes: list.sort(byTitle) }))
  return { days, undated }
}

export function selectDay(feed: Feed, requested: string | null): number {
  if (feed.days.length === 0) return -1
  if (requested) {
    const index = feed.days.findIndex(day => day.date === requested)
    if (index >= 0) return index
  }
  return 0
}

export function neighbours(feed: Feed, index: number): { newer: string | null; older: string | null } {
  if (index < 0 || index >= feed.days.length) return { newer: null, older: null }
  return {
    newer: index > 0 ? feed.days[index - 1].date : null,
    older: index < feed.days.length - 1 ? feed.days[index + 1].date : null
  }
}

// The last `max` dates, plus the selected one when it is older than that —
// the mobile date picker needs an option matching its value.
export function visibleDates(feed: Feed, index: number, max = 30): string[] {
  const dates = feed.days.slice(0, max).map(day => day.date)
  if (index >= max && feed.days[index]) dates.push(feed.days[index].date)
  return dates
}

export function feedHeading(date: string): string {
  const day = toDay(date)
  if (!day) return date
  const [y, m, d] = day.split('-').map(Number)
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).formatToParts(new Date(Date.UTC(y, m - 1, d)))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`
}

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' } as const
  try {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone })
  } catch {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' })
  }
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = dayFormatter(timeZone).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function hasToday(notes: NoteMeta[], tab: TabConfig, timeZone: string, now: Date = new Date()): boolean {
  const options = parseFeedOptions(tab.options)
  if (!options.ok) return false
  const today = todayIn(timeZone, now)
  return notes.some(note => feedDate(note, options.value.dateField) === today)
}

function asList<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export function emptyMessage(query: Query): string {
  const clauses: QueryClause[] = Array.isArray(query) ? query : [query]
  const briefShaped = clauses.some(
    clause => asList(clause.type).includes('daily-brief') || asList(clause.path).some(glob => glob.includes('daily_report'))
  )
  return briefShaped ? BRIEF_EMPTY : GENERIC_EMPTY
}

export function undatedLabel(count: number): string {
  return count === 1 ? "1 note without a date isn't shown here." : `${count} notes without a date aren't shown here.`
}
