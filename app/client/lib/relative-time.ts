// "Just now", "12 min ago", "3 h ago", "2 d ago", then a plain date.
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatLastActive(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'Never'
  const age = now.getTime() - then.getTime()
  if (age < MINUTE) return 'Just now'
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`
  if (age < 7 * DAY) return `${Math.floor(age / DAY)} d ago`
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
