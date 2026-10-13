// Aggregation for the `stats` view (spec §12): KPI tiles and one optional bar
// chart. Numbers come through parseLooseNumber; values that can't be read are
// "not counted", never 0. Different currencies are never added together, unless the caller
// passes a Conversion (D114): then every amount is converted to one currency first.
import { z } from 'zod'
import { convertAmount, currencyCode, type Conversion } from './currency'
import { formatCurrency, parseLooseNumber } from './format'
import { runTab } from './query'
import { readField } from './read-field'
import type { NoteMeta, QueryClause, VaultIndex } from './types'

const AggSchema = z.enum(['count', 'sum', 'avg', 'min', 'max'])
const ScalarSchema = z.union([z.string(), z.number(), z.boolean()])
const WhereSchema = z.record(z.string(), z.union([ScalarSchema, z.array(ScalarSchema)]))
const needsField = (spec: { agg: string; field?: string }) => spec.agg === 'count' || !!spec.field
const FIELD_MESSAGE = { message: 'needs a field for sum, avg, min and max', path: ['field'] }

const TileSchema = z
  .object({
    label: z.string().min(1),
    agg: AggSchema,
    field: z.string().min(1).optional(),
    where: WhereSchema.optional(),
    type: z.string().min(1).optional(),
    format: z.enum(['number', 'currency']).optional(),
    groupBy: z.string().min(1).optional(),
    normalize: z.object({ field: z.string().min(1), factors: z.record(z.string(), z.number()) }).strict().optional()
  })
  .strict()
  .refine(needsField, FIELD_MESSAGE)

const ChartSchema = z
  .object({
    kind: z.literal('bar'),
    groupBy: z.string().min(1),
    agg: AggSchema,
    field: z.string().min(1).optional(),
    label: z.string().min(1)
  })
  .strict()
  .refine(needsField, FIELD_MESSAGE)

// .strict() so a typo in a tab's options is reported the way it is for list and table (D42 R2).
export const StatsOptionsSchema = z.object({ tiles: z.array(TileSchema).default([]), chart: ChartSchema.optional() }).strict()

export type Agg = z.infer<typeof AggSchema>
export type TileSpec = z.infer<typeof TileSchema>
export type ChartSpec = z.infer<typeof ChartSchema>
export type StatsOptions = z.infer<typeof StatsOptionsSchema>

export interface TileResult {
  label: string
  value: number | null
  format: 'number' | 'currency'
  currency: string | null
  count: number
  skipped: number
  display: string
  /** The other currencies whose amounts were converted into `currency`, for the footnote. */
  convertedFrom: string[]
}

export interface ChartPoint {
  key: string
  label: string
  value: number
}

interface Group {
  key: string
  label: string
  missing: boolean
  notes: NoteMeta[]
}

const MAX_BARS = 12

function filterNotes(notes: NoteMeta[], index: VaultIndex, spec: { type?: string; where?: QueryClause['where'] }): NoteMeta[] {
  const clause: QueryClause = {}
  if (spec.type) clause.type = spec.type
  if (spec.where && Object.keys(spec.where).length) clause.where = spec.where
  if (!clause.type && !clause.where) return notes
  return runTab({ id: '__stats', title: '', view: 'list', query: clause }, { ...index, notes })
}

function textOf(note: NoteMeta, field: string): string {
  const value = readField(note, field)
  const first = Array.isArray(value) ? value[0] : value
  return first == null ? '' : String(first).trim()
}

function groupBy(notes: NoteMeta[], field: string): Group[] {
  const groups = new Map<string, Group>()
  const missing: Group = { key: '\u0000none', label: `no ${field}`, missing: true, notes: [] }
  for (const note of notes) {
    const text = textOf(note, field)
    if (!text) {
      missing.notes.push(note)
      continue
    }
    const key = text.toLowerCase()
    let group = groups.get(key)
    if (!group) {
      group = { key, label: text, missing: false, notes: [] }
      groups.set(key, group)
    }
    group.notes.push(note)
  }
  const sorted = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
  return missing.notes.length ? [...sorted, missing] : sorted
}

function currencies(notes: NoteMeta[]): string[] {
  const seen = new Map<string, string>()
  for (const note of notes) {
    const text = textOf(note, 'currency')
    if (text && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text)
  }
  return [...seen.values()]
}

function factorFor(factors: Record<string, number>, key: string): number | undefined {
  return Object.entries(factors).find(([name]) => name.toLowerCase() === key)?.[1]
}

/** Converts one note's amount into the display currency; null (not counted) when its currency is missing or has no rate. */
function converter(conv: Conversion): (note: NoteMeta, value: number) => number | null {
  return (note, value) => {
    const from = currencyCode(textOf(note, 'currency'))
    return from ? convertAmount(value, from, conv.to, conv.rates) : null
  }
}

export function aggregate(
  notes: NoteMeta[],
  agg: Agg,
  field?: string,
  normalize?: TileSpec['normalize'],
  conv?: Conversion
): { value: number | null; count: number; skipped: number } {
  if (agg === 'count') return { value: notes.length, count: notes.length, skipped: 0 }
  if (!field) return { value: null, count: notes.length, skipped: notes.length }
  const values: number[] = []
  const convert = conv ? converter(conv) : null
  let skipped = 0
  for (const note of notes) {
    let value = parseLooseNumber(readField(note, field))
    if (value !== null && normalize) {
      const factor = factorFor(normalize.factors, textOf(note, normalize.field).toLowerCase())
      value = factor === undefined ? null : value * factor
    }
    if (value !== null && convert) value = convert(note, value)
    if (value === null) skipped++
    else values.push(value)
  }
  if (!values.length) return { value: null, count: notes.length, skipped }
  const sum = values.reduce((total, value) => total + value, 0)
  const value = agg === 'sum' ? sum : agg === 'avg' ? sum / values.length : agg === 'min' ? Math.min(...values) : Math.max(...values)
  return { value, count: notes.length, skipped }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value)
}

export function formatTileValue(value: number | null, format: 'number' | 'currency', currency: string | null): string {
  if (value === null) return '—'
  if (format === 'currency') {
    // Only ISO 4217-shaped codes go to Intl; "kr." and friends would throw or print oddly.
    if (!currency || /^[A-Za-z]{3}$/.test(currency)) {
      try {
        return formatCurrency(value, currency ?? undefined)
      } catch {
        // Unknown three-letter code: fall through to a plain number.
      }
    }
    return currency ? `${formatNumber(value)} ${currency}` : formatNumber(value)
  }
  return formatNumber(value)
}

export function tileFootnote(tile: TileResult): string {
  const notes = `${tile.count} ${tile.count === 1 ? 'note' : 'notes'}`
  const counted = tile.skipped ? `${notes} · ${tile.skipped} not counted` : notes
  return tile.convertedFrom.length ? `${counted} · converted from ${tile.convertedFrom.join(', ')}` : counted
}

// Money tiles are the ones a Conversion applies to: not counts, not tiles pinned to plain numbers.
const isMoneyTile = (spec: TileSpec) => spec.agg !== 'count' && spec.format !== 'number'

function result(label: string, spec: TileSpec, notes: NoteMeta[], currencyOverride?: string | null, conv?: Conversion): TileResult {
  const { value, count, skipped } = aggregate(notes, spec.agg, spec.field, spec.normalize, conv)
  const found = currencies(notes)
  const format = spec.agg === 'count' ? 'number' : (spec.format ?? (found.length ? 'currency' : 'number'))
  const currency = conv ? conv.to : currencyOverride !== undefined ? currencyOverride : found.length === 1 ? found[0] : null
  const convertedFrom = conv ? [...new Set(found.map(c => currencyCode(c)).filter((c): c is string => c !== null && c !== conv.to))].sort() : []
  return {
    label,
    value,
    format,
    currency: format === 'currency' ? currency : null,
    count,
    skipped,
    display: formatTileValue(value, format, currency),
    convertedFrom
  }
}

// One tile per currency whenever a field aggregate would otherwise add different currencies.
function splitByCurrency(spec: TileSpec, label: string, notes: NoteMeta[]): TileResult[] {
  if (spec.agg === 'count' || spec.format === 'number' || currencies(notes).length <= 1) return [result(label, spec, notes)]
  return groupBy(notes, 'currency').map(group => result(`${label} · ${group.label}`, spec, group.notes, group.missing ? null : group.label))
}

export function computeTile(spec: TileSpec, notes: NoteMeta[], index: VaultIndex, conv?: Conversion): TileResult[] {
  const pool = filterNotes(notes, index, spec)
  // With a display currency, one tile adds everything up in it, so the per-currency split is no longer needed.
  if (conv && isMoneyTile(spec)) {
    if (!spec.groupBy || spec.groupBy === 'currency') return [result(spec.label, spec, pool, undefined, conv)]
    const groups = groupBy(pool, spec.groupBy)
    if (!groups.length) return [result(spec.label, spec, [], undefined, conv)]
    return groups.map(group => result(`${spec.label} · ${group.label}`, spec, group.notes, undefined, conv))
  }
  if (!spec.groupBy) return splitByCurrency(spec, spec.label, pool)
  const groups = groupBy(pool, spec.groupBy)
  if (!groups.length) return [result(spec.label, spec, [])]
  if (spec.groupBy === 'currency') {
    return groups.map(group => result(`${spec.label} · ${group.label}`, spec, group.notes, group.missing ? null : group.label))
  }
  return groups.flatMap(group => splitByCurrency(spec, `${spec.label} · ${group.label}`, group.notes))
}

// One bar per currency whenever a field aggregate would otherwise add different currencies
// (count charts have no currency). `currency` is kept so the "Other" fold can stay per currency too.
interface ChartEntry {
  key: string
  label: string
  notes: NoteMeta[]
  currency: string | null
}

function chartEntries(groups: Group[], spec: ChartSpec, conv?: Conversion): ChartEntry[] {
  if (conv) return groups.map(group => ({ key: group.key, label: group.label, notes: group.notes, currency: conv.to }))
  return groups.flatMap((group): ChartEntry[] => {
    const found = spec.agg === 'count' ? [] : currencies(group.notes)
    if (found.length <= 1) return [{ key: group.key, label: group.label, notes: group.notes, currency: found[0] ?? null }]
    return groupBy(group.notes, 'currency').map(sub => ({
      key: `${group.key}\u0001${sub.key}`,
      label: `${group.label} · ${sub.label}`,
      notes: sub.notes,
      currency: sub.missing ? null : sub.label
    }))
  })
}

export function computeChart(spec: ChartSpec, notes: NoteMeta[], index: VaultIndex, conv?: Conversion): ChartPoint[] {
  const groups = groupBy(filterNotes(notes, index, {}), spec.groupBy)
  const money = conv && spec.agg !== 'count' ? conv : undefined
  const points = chartEntries(groups, spec, money)
    .map(entry => ({ entry, value: aggregate(entry.notes, spec.agg, spec.field, undefined, money).value }))
    .filter((point): point is { entry: ChartEntry; value: number } => point.value !== null)
    .sort((a, b) => b.value - a.value || a.entry.key.localeCompare(b.entry.key))
  const toPoint = ({ entry, value }: { entry: ChartEntry; value: number }): ChartPoint => ({ key: entry.key, label: entry.label, value })
  if (points.length <= MAX_BARS) return points.map(toPoint)
  const tail = new Map<string, ChartEntry[]>()
  for (const { entry } of points.slice(MAX_BARS - 1)) {
    const bucket = entry.currency?.toLowerCase() ?? ''
    tail.set(bucket, [...(tail.get(bucket) ?? []), entry])
  }
  const others = [...tail.values()].map((entries, i): ChartPoint => {
    const currency = entries[0].currency
    const value = aggregate(entries.flatMap(e => e.notes), spec.agg, spec.field, undefined, money).value ?? 0
    return { key: i === 0 ? '\u0000other' : `\u0000other${i}`, label: currency && tail.size > 1 ? `Other · ${currency}` : 'Other', value }
  })
  return [...points.slice(0, MAX_BARS - 1).map(toPoint), ...others.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))]
}
