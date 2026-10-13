// app/client/views/cells.tsx
// Column specs and cell rendering shared by table-like views, plus the inline
// error a view shows when its config options don't validate (spec §15).
import { useContext, type ReactNode } from 'react'
import { z } from 'zod'
import { convertAmount, currencyCode, type Conversion } from '../../lib/currency'
import { formatCurrency, formatDate, parseLooseNumber } from '../../lib/format'
import { linkedinLabel, linkedinUrl } from '../../lib/people'
import { getField } from '../../lib/query'
import type { NoteMeta } from '../../lib/types'
import { CurrencyContext } from '../lib/currency'
import { Badge } from '../ui/badge'

export const CELL_FORMATS = ['text', 'date', 'number', 'currency', 'rating', 'link', 'tags'] as const
export type CellFormat = (typeof CELL_FORMATS)[number]
export interface ColumnSpec {
  field: string
  label: string
  format: CellFormat
}

export const columnSchema = z.union([
  z.string().min(1),
  z.object({ field: z.string().min(1), label: z.string().optional(), format: z.enum(CELL_FORMATS).optional() }).strict()
])

const DATE_FIELDS = new Set(['date', 'updated', 'created', 'started', 'finished', 'watched', 'renews', 'due', 'last_contact', 'birthday', 'as_of', 'lastSeen'])

export function labelFor(field: string): string {
  const words = field.replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`).replace(/[_-]+/g, ' ').trim()
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : field
}

function guessFormat(field: string): CellFormat {
  if (DATE_FIELDS.has(field)) return 'date'
  if (field === 'tags') return 'tags'
  if (field === 'rating') return 'rating'
  if (field === 'url' || field === 'link' || field === 'linkedin') return 'link'
  return 'text'
}

export function toColumn(column: z.infer<typeof columnSchema>): ColumnSpec {
  const spec = typeof column === 'string' ? { field: column } : column
  return { field: spec.field, label: spec.label ?? labelFor(spec.field), format: spec.format ?? guessFormat(spec.field) }
}

export function displayValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(displayValue).join(', ')
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v && typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const toList = (v: unknown): string[] => (Array.isArray(v) ? v.flat(Infinity).map(String) : [String(v)])

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function hasValue(note: NoteMeta, column: ColumnSpec): boolean {
  const value = getField(note, column.field)
  return !(value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0))
}

/** An amount in the display currency, plus what the note wrote when that differs. No conversion → just the amount as written. */
export function currencyCell(amount: number, currency: unknown, conv: Conversion | null): { main: string; original: string | null } {
  const written = typeof currency === 'string' ? currency : undefined
  const from = currencyCode(written)
  const converted = conv && from && from !== conv.to ? convertAmount(amount, from, conv.to, conv.rates) : null
  if (converted === null) return { main: formatCurrency(amount, written), original: null }
  return { main: formatCurrency(converted, conv!.to), original: formatCurrency(amount, written) }
}

export function Cell({ note, column }: { note: NoteMeta; column: ColumnSpec }): ReactNode {
  const { conversion } = useContext(CurrencyContext)
  if (!hasValue(note, column)) return <span className="text-muted-foreground">—</span>
  const value = getField(note, column.field)
  switch (column.format) {
    case 'date':
      return typeof value === 'string' ? formatDate(value, 'short') : displayValue(value)
    case 'number': {
      const n = parseLooseNumber(value)
      return <span className="tabular-nums">{n === null ? displayValue(value) : n.toLocaleString('en-GB')}</span>
    }
    case 'currency': {
      const n = parseLooseNumber(value)
      if (n === null) return <span className="tabular-nums">{displayValue(value)}</span>
      const { main, original } = currencyCell(n, note.frontmatter.currency, conversion)
      return (
        <span className="tabular-nums">
          {main}
          {original && <span className="ml-1.5 text-xs text-muted-foreground">({original})</span>}
        </span>
      )
    }
    case 'rating': {
      const n = parseLooseNumber(value)
      if (n === null) return displayValue(value)
      const stars = Math.max(0, Math.min(5, Math.round(n)))
      return (
        <span aria-label={`${n} out of 5`}>
          {'★'.repeat(stars)}
          <span className="text-muted-foreground">{'★'.repeat(5 - stars)}</span>
        </span>
      )
    }
    case 'link': {
      // `linkedin` may be a bare handle; other links must already be http(s).
      const linkedin = column.field === 'linkedin'
      const href = linkedin ? linkedinUrl(value) : typeof value === 'string' && /^https?:\/\//.test(value) ? value : null
      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" onClick={e => e.stopPropagation()}>
          {linkedin ? linkedinLabel(href) : hostOf(href)}
        </a>
      ) : (
        displayValue(value)
      )
    }
    case 'tags':
      return (
        <span className="flex flex-wrap gap-1">
          {toList(value).map(t => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </span>
      )
    default:
      return displayValue(value)
  }
}

export function OptionsError({ view, error }: { view: string; error: z.ZodError }) {
  const issue = error.issues[0]
  return (
    <p className="px-4 py-3 text-sm text-muted-foreground">
      The {view} view's options aren't valid: <code className="font-mono text-xs">{issue?.path.join('.') || 'options'}</code>{' '}
      {issue?.message}
    </p>
  )
}
