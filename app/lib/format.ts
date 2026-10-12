// app/lib/format.ts
// Display helpers shared by every view: lenient numbers from frontmatter
// strings ("25,00 kr."), dates without timezone shifts, currency.

const NUMBER_TOKEN = /-?[.,]?\d(?:[\d.,'   ]*\d)?/

// Leading digits of a thousands-grouped number: 1–3 digits, not led by 0 ("0.500" is a half).
const THOUSANDS_LEAD = /^[1-9]\d{0,2}$/

/** "1.234.567" is grouped, "2.5.1" (a version) and "1.234.56" are not. */
function isGrouped(s: string, sep: string): boolean {
  const [lead, ...rest] = s.split(sep)
  return THOUSANDS_LEAD.test(lead) && rest.every(group => /^\d{3}$/.test(group))
}

/**
 * Numbers from loosely written frontmatter (spec §12, D13, D23):
 * - both "," and "." present → the last one is the decimal mark
 * - one kind only → a single separator followed by exactly 3 digits is a thousands mark when the integer
 *   part is 1–3 digits not led by 0 ("1,234" → 1234, "0.500" → 0.5), otherwise a decimal
 * - a separator repeated → thousands marks, which must be well-formed groups; "v2.5.1" is not a number
 * - a leading separator is a decimal mark (".5" → 0.5)
 * - currency symbols and words are ignored
 */
export function parseLooseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const match = NUMBER_TOKEN.exec(v)
  if (!match) return null
  let token = match[0]
  const negative = token.startsWith('-')
  const sepAt = match.index + (negative ? 1 : 0)
  // A leading separator is a decimal mark, unless it is glued to a word or another separator ("ca.25").
  if (/^-?[.,]/.test(token) && sepAt > 0 && /[\w.,]/.test(v[sepAt - 1])) token = token.replace(/^(-?)[.,]/, '$1')
  let s = token.replace(/^-/, '').replace(/['   ]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.'
    const thousands = decimal === ',' ? '.' : ','
    const whole = s.slice(0, s.lastIndexOf(decimal))
    if (!isGrouped(whole, thousands)) return null
    s = whole.split(thousands).join('') + s.slice(whole.length).replace(decimal, '.')
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const parts = s.split(sep)
    if (parts.length > 2) {
      if (!isGrouped(s, sep)) return null
      s = parts.join('')
    } else {
      const [whole, fraction] = parts
      s = fraction.length === 3 && THOUSANDS_LEAD.test(whole) ? whole + fraction : `${whole}.${fraction}`
    }
  }
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "6 Oct 2026" or "Tuesday, 6 October 2026". Uses the date part only, so no timezone shift. */
export function formatDate(iso: string, style: 'short' | 'long'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1) return iso
  if (style === 'short') return `${day} ${MONTHS_SHORT[month - 1]} ${year}`
  return `${WEEKDAYS[date.getDay()]}, ${day} ${MONTHS_LONG[month - 1]} ${year}`
}

export function formatCurrency(n: number, currency?: string): string {
  if (currency && /^[a-z]{3}$/i.test(currency.trim())) {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.trim().toUpperCase() }).format(n)
    } catch {
      // Unknown ISO-looking code: fall through to the plain form.
    }
  }
  const plain = n.toLocaleString('en-GB', { maximumFractionDigits: 2 })
  return currency ? `${plain} ${currency.trim()}` : plain
}
