// app/lib/srs.ts
// When a flashcard is next due, by SuperMemo's SM-2 (D130). A card starts at ease 2.5; each answer that isn't
// "again" moves it 1 day, then 6, then the last interval × ease, rounded up, and nudges the ease
// (0.1 − (5−q)(0.08 + (5−q)·0.02), never below 1.3). "Again" starts the card over at 1 day and keeps the ease.
// Dates are local `YYYY-MM-DD` strings, so a review never shifts a day across time zones. Pure and client-safe.

/** 1 again · 2 hard · 3 good · 4 easy. */
export type Grade = 1 | 2 | 3 | 4

export interface CardState {
  /** The day the card is next shown. */
  due: string
  /** Days between `last` and `due`. */
  interval: number
  ease: number
  /** Answers in a row that weren't "again". */
  reps: number
  /** How often the card was forgotten ("again") after it was first learned or tried. */
  lapses: number
  /** The day of the last answer. */
  last: string
}

export const START_EASE = 2.5
export const MIN_EASE = 1.3
// SM-2 grades answers 0 to 5; below 3 is a lapse. The four buttons map to 1, 3, 4 and 5.
const QUALITY: Record<Grade, number> = { 1: 1, 2: 3, 3: 4, 4: 5 }

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The state after answering `grade` on `today`. `state` is undefined for a card never reviewed. */
export function sm2(state: CardState | undefined, grade: Grade, today: string): CardState {
  const q = QUALITY[grade]
  const ease = state?.ease ?? START_EASE
  const lapses = state?.lapses ?? 0
  if (q < 3) return { due: addDays(today, 1), interval: 1, ease, reps: 0, lapses: lapses + 1, last: today }
  const reps = (state?.reps ?? 0) + 1
  // - 1e-9: 50 × 2.22 is 111.00000000000001 in floating point, which must stay 111 days, not round up to 112.
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.ceil((state?.interval ?? 1) * ease - 1e-9)
  const next = Math.max(MIN_EASE, Math.round((ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)) * 100) / 100)
  return { due: addDays(today, interval), interval, ease: next, reps, lapses, last: today }
}

/** Is the card due on `today` (or overdue)? A card never reviewed is new, not due. */
export function isDue(state: CardState | undefined, today: string): boolean {
  return state !== undefined && state.due <= today
}
