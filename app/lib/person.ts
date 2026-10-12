// Pure helpers for the person reader header (spec §12). Dates are compared as
// calendar days in UTC so DST changes never shift a birthday countdown.
import { formatDate } from './format'
import { asText } from './read-field'
import type { NoteMeta } from './types'

export const PERSON_FIELDS = ['relationship', 'company', 'role', 'location', 'last_contact', 'email', 'phone', 'birthday', 'linkedin', 'cadence']

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_MS = 86_400_000

export function initials(name: string): string {
  const words = name.trim().split(/[\s\-_.]+/).filter(Boolean)
  if (!words.length) return '?'
  const first = Array.from(words[0])[0]
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : ''
  return (first + last).toUpperCase()
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

/** "1990-03-14", "--03-14", "03-14" (optionally with a time) → { month, day }. */
export function parseMonthDay(value: unknown): { month: number; day: number } | null {
  if (typeof value !== 'string') return null
  const match = /^(?:\d{4}-|--)?(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(value.trim())
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month)) return null
  return { month, day }
}

export function daysUntilBirthday(value: unknown, today: Date): number | null {
  const md = parseMonthDay(value)
  if (!md) return null
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    const day = md.month === 2 && md.day === 29 && !isLeap(year) ? 28 : md.day
    const next = Date.UTC(year, md.month - 1, day)
    if (next >= start) return Math.round((next - start) / DAY_MS)
  }
  return null
}

export function birthdayCountdown(days: number | null): string | null {
  if (days === null || days > 30) return null
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export function formatMonthDay(md: { month: number; day: number }): string {
  return `${md.day} ${MONTHS[md.month - 1]}`
}

export interface PersonFacts {
  initials: string
  relationship: string | null
  work: string | null
  location: string | null
  lastContact: string | null
  email: string | null
  emailHref: string | null
  phone: string | null
  phoneHref: string | null
  birthday: { label: string; countdown: string | null } | null
}

export function personFacts(note: NoteMeta, today: Date = new Date()): PersonFacts {
  const fm = note.frontmatter
  const role = asText(fm.role)
  const company = asText(fm.company)
  const email = asText(fm.email)
  const phone = asText(fm.phone)
  const phoneDigits = phone?.replace(/[^\d+]/g, '') ?? ''
  const birthdayText = asText(fm.birthday)
  const md = parseMonthDay(birthdayText)
  return {
    initials: initials(note.title),
    relationship: asText(fm.relationship),
    work: role && company ? `${role} at ${company}` : (role ?? company),
    location: asText(fm.location),
    // lastSeen (compile time) also counts dated lines in the body; free-text last_contact is still shown as written.
    lastContact: note.lastSeen ?? asText(fm.last_contact),
    email,
    emailHref: email && /^[^\s@]+@[^\s@]+$/.test(email) ? `mailto:${email}` : null,
    phone,
    phoneHref: phoneDigits.replace('+', '').length >= 3 ? `tel:${phoneDigits}` : null,
    // A birthday soii can't parse is shown as written: the header hides `birthday` from the properties panel.
    birthday: md
      ? { label: formatMonthDay(md), countdown: birthdayCountdown(daysUntilBirthday(asText(fm.birthday), today)) }
      : birthdayText
        ? { label: birthdayText, countdown: null }
        : null
  }
}

export function hasDetails(facts: PersonFacts): boolean {
  return [facts.relationship, facts.work, facts.location, facts.lastContact, facts.email, facts.phone, facts.birthday].some(v => v !== null)
}

/**
 * How the header shows `last_contact`: relative for the past, a plain date for a future one
 * (Core's relative formatter would say "Just now"), and the text as written unless it starts with
 * an ISO date (`new Date()` would turn "October 1" into 2001). A date-only value is compared as a
 * calendar day in the reader's own timezone. `formatRelative` is passed in so this file stays
 * free of client code.
 */
export function lastContactLabel(raw: string, now: Date, formatRelative: (iso: string, now: Date) => string): string {
  const text = raw.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text)
  if (!m) return raw
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const calendar = new Date(year, month - 1, day)
  if (calendar.getMonth() !== month - 1 || calendar.getDate() !== day) return raw
  if (text.length === 10) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return calendar.getTime() > today.getTime() ? formatDate(text, 'short') : formatRelative(raw, now)
  }
  const then = new Date(text)
  if (Number.isNaN(then.getTime())) return raw
  return then.getTime() > now.getTime() ? formatDate(text, 'short') : formatRelative(raw, now)
}
