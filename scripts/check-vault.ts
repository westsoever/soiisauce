// Read-only: lists the notes soii can't read properly — broken frontmatter, base64 bodies,
// types and property values soii doesn't understand, broken wikilinks — so a person or an
// agent can fix them in the vault. It never writes a file. The rules come from soii's own
// parser and config; the few that only exist in docs/frontmatter.md are in DOC_ENUMS and
// DOC_NUMBERS below.
//
//   bun scripts/check-vault.ts <vaultDir> [--json]
//
// Exit code 1 when there is at least one error, else 0.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { ConfigError } from '../app/lib/config-schema'
import { resolveConfig } from '../app/lib/merge-config'
import { parseLooseNumber } from '../app/lib/format'
import { LOG_KINDS } from '../app/lib/log'
import { CADENCE_CHOICES, ownCadence } from '../app/lib/people'
import { parseMonthDay } from '../app/lib/person'
import { DATE_KEYS, NUMBER_KEYS } from '../app/lib/properties'
import { canonicalType } from '../app/lib/query'
import { expectedFields } from '../app/lib/type-fields'
import type { SoiiConfig } from '../app/lib/types'
import { loadConfig } from '../app/vault/compile'
import { deriveFields, isHiddenYaml, parseFrontmatter, splitFrontmatter } from '../app/vault/frontmatter'
import { createLinkResolver } from '../app/vault/links'
import { renderMarkdown } from '../app/vault/markdown'
import { walkVault } from '../app/vault/walk'
import { decodeBase64Markdown } from './find-base64-notes'

export type Severity = 'error' | 'warning' | 'info'
export type Rule =
  | 'config-invalid'
  | 'frontmatter-invalid'
  | 'base64-note'
  | 'duplicate-note'
  | 'unknown-type'
  | 'enum-value'
  | 'enum-case'
  | 'date-format'
  | 'number-format'
  | 'broken-link'
  | 'missing-type'
  | 'missing-field'

export interface Finding {
  /** Vault-relative, "/"-separated. */
  path: string
  severity: Severity
  rule: Rule
  message: string
  /** The frontmatter key the finding is about, when there is one. */
  field?: string
  /** What to change, when it's obvious (often the corrected `key: value` line). */
  fix?: string
  /** broken-link: every missing target in the note, in order of appearance. */
  targets?: string[]
  /** missing-field: the documented keys the note doesn't have, in the order docs/frontmatter.md lists them. */
  fields?: string[]
  /** missing-field: the note's canonical type. */
  type?: string
}

export interface VaultCheck {
  notes: number
  findings: Finding[]
}

// ---- Rules that only exist in docs/frontmatter.md ("Fields per type") -----------------------
// Library statuses and goal status/horizon come from the Log's own pickers (LOG_KINDS); these don't have one.
export const DOC_ENUMS: Record<string, Record<string, string[]>> = {
  subscription: { cycle: ['weekly', 'monthly', 'yearly'], status: ['active', 'paused', 'cancelled'] },
  person: { circle: ['friends', 'network'] }
}
/** Numeric fields beyond the property editor's NUMBER_KEYS, with their documented ranges. */
export const DOC_NUMBERS = ['price', 'balance', 'progress']
const RANGES: Record<string, [number, number]> = { rating: [1, 5], progress: [0, 100] }

/** Picker fields that are closed lists. Others (relationship, expense category, currency) are suggestions only. */
const CLOSED_SELECTS = new Set(['status', 'horizon'])

function enumTable(): Record<string, Record<string, string[]>> {
  const table = structuredClone(DOC_ENUMS)
  for (const kind of LOG_KINDS) {
    if (!kind.type) continue
    for (const f of [...kind.quick, ...kind.more]) {
      if (f.kind === 'select' && f.options && CLOSED_SELECTS.has(f.key)) (table[kind.type] ??= {})[f.key] = f.options
    }
  }
  return table
}

const NUMERIC_KEYS = new Set([...NUMBER_KEYS, ...DOC_NUMBERS])

// ---- Small helpers -------------------------------------------------------------------------

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length]
}

/** The closest candidate within 2 edits (1 for short words), or null. */
function closest(word: string, candidates: Iterable<string>): string | null {
  const w = word.toLowerCase()
  const limit = w.length <= 4 ? 1 : 2
  let best: string | null = null
  let bestScore = limit + 1
  for (const c of candidates) {
    const d = editDistance(w, c.toLowerCase())
    if (d < bestScore) {
      best = c
      bestScore = d
    }
  }
  return best
}

/** "2026-09-14" when it is a real calendar date. */
function realDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const monthNumber = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1

/** The YYYY-MM-DD form of a loosely written date, or null when it isn't one or day and month could swap. */
export function suggestIsoDate(value: string): string | null {
  const s = value.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s)
  if (m) return realDate(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s)
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]]
    if (a > 12 && b <= 12) return realDate(y, b, a)
    if (b > 12 && a <= 12) return realDate(y, a, b)
    return a === b ? realDate(y, a, b) : null
  }
  m = /^([A-Za-z]{3,})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(s)
  if (m && monthNumber(m[1])) return realDate(+m[3], monthNumber(m[1]), +m[2])
  m = /^(\d{1,2})(?:st|nd|rd|th)?\.? ([A-Za-z]{3,})\.?,? (\d{4})$/.exec(s)
  if (m && monthNumber(m[2])) return realDate(+m[3], monthNumber(m[2]), +m[1])
  return null
}

/** A date soii reads: YYYY-MM-DD, optionally followed by a time. */
function isIsoDate(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(v.trim())
  return m !== null && realDate(+m[1], +m[2], +m[3]) !== null
}

// ---- Per-note property checks --------------------------------------------------------------

type Push = (f: Omit<Finding, 'path'>) => void

function checkType(data: Record<string, unknown>, config: SoiiConfig, known: Set<string>, push: Push): void {
  const raw = Array.isArray(data.type) ? data.type[0] : data.type
  if (isBlank(raw)) return
  if (typeof raw !== 'string') {
    push({ severity: 'warning', rule: 'unknown-type', field: 'type', message: `\`type: ${show(raw)}\` isn't text, so soii ignores it.` })
    return
  }
  const canonical = canonicalType(raw, config.types)
  if (known.has(canonical)) return
  const aliases = Object.entries(config.types).flatMap(([name, list]) => [name, ...list])
  const near = closest(canonical, aliases)
  push({
    severity: 'warning',
    rule: 'unknown-type',
    field: 'type',
    message: `soii doesn't know \`type: ${raw.trim()}\`, so no workspace lists it (it's still readable as a plain note).`,
    fix: near
      ? `type: ${canonicalType(near, config.types)}`
      : `Add \`${canonical}\` to \`types\` in soii.config.yml if a workspace should list it, or leave it as a plain note.`
  })
}

function checkEnums(data: Record<string, unknown>, type: string | null, enums: Record<string, Record<string, string[]>>, push: Push): void {
  for (const [field, options] of Object.entries((type && enums[type]) || {})) {
    const value = data[field]
    if (isBlank(value)) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      const text = String(item).trim()
      const exact = options.find(o => o === text)
      if (exact) continue
      const loose = options.find(o => o.toLowerCase() === text.toLowerCase())
      if (loose) {
        push({ severity: 'info', rule: 'enum-case', field, message: `\`${field}: ${text}\` works, but the documented spelling is lowercase.`, fix: `${field}: ${loose}` })
        continue
      }
      const near = closest(text, options)
      push({
        severity: 'warning',
        rule: 'enum-value',
        field,
        message: `\`${field}: ${text}\` isn't one of the ${type} values soii knows (${options.join(', ')}).`,
        ...(near ? { fix: `${field}: ${near}` } : {})
      })
    }
  }
  if (type === 'person' && !isBlank(data.cadence) && ownCadence(data.cadence) === undefined) {
    push({
      severity: 'warning',
      rule: 'enum-value',
      field: 'cadence',
      message: `soii can't read \`cadence: ${show(data.cadence)}\`. Use a number of days or one of ${CADENCE_CHOICES.join(', ')}.`
    })
  }
}

/** Documented keys for the note's type that aren't in its frontmatter at all. An empty `rating:` counts as there. */
function checkMissingFields(data: Record<string, unknown>, type: string | null, push: Push): void {
  const missing = expectedFields(type ?? '').filter(key => !(key in data))
  if (!missing.length) return
  push({
    severity: 'info',
    rule: 'missing-field',
    fields: missing,
    type: type ?? undefined,
    message: `Missing properties for \`type: ${type}\`: ${missing.join(', ')}.`,
    fix: `Add the keys, empty is fine: ${missing.join(', ')}`
  })
}

function checkDates(data: Record<string, unknown>, push: Push): void {
  for (const field of DATE_KEYS) {
    const value = data[field]
    if (isBlank(value)) continue
    const ok = field === 'birthday' ? parseMonthDay(value) !== null : isIsoDate(value)
    if (ok) continue
    const iso = typeof value === 'string' ? suggestIsoDate(value) : null
    const want = field === 'birthday' ? 'YYYY-MM-DD (or --MM-DD without a year)' : 'YYYY-MM-DD'
    push({
      severity: 'warning',
      rule: 'date-format',
      field,
      message: `\`${field}: ${show(value)}\` isn't a ${want} date, so soii can't sort or show it as one.`,
      ...(iso ? { fix: `${field}: ${iso}` } : {})
    })
  }
}

function checkNumbers(data: Record<string, unknown>, push: Push): void {
  for (const field of NUMERIC_KEYS) {
    const value = data[field]
    if (isBlank(value)) continue
    const n = parseLooseNumber(value)
    let problem: string | null = null
    if (n === null) problem = "isn't a number"
    else if (field === 'year' && !(Number.isInteger(n) && n >= 1000 && n <= 9999)) problem = "isn't a four-digit year"
    else if (RANGES[field] && (n < RANGES[field][0] || n > RANGES[field][1])) problem = `is outside ${RANGES[field][0]}–${RANGES[field][1]}`
    if (problem) push({ severity: 'warning', rule: 'number-format', field, message: `\`${field}: ${show(value)}\` ${problem}.` })
  }
}

// ---- The vault -----------------------------------------------------------------------------

const MAX_LISTED_LINKS = 10
const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Canonical types soii recognises: config.types plus any type a workspace query asks for. */
function knownTypes(config: SoiiConfig): Set<string> {
  const known = new Set(Object.keys(config.types).map(t => canonicalType(t, config.types)))
  for (const tab of config.workspaces.flatMap(w => w.tabs)) {
    for (const clause of Array.isArray(tab.query) ? tab.query : [tab.query]) {
      const types = clause.type === undefined ? [] : Array.isArray(clause.type) ? clause.type : [clause.type]
      for (const t of types) known.add(canonicalType(t, config.types))
    }
  }
  return known
}

const stripMd = (p: string) => p.replace(/\.md$/i, '')

export async function inspectVault(root: string): Promise<VaultCheck> {
  const findings: Finding[] = []
  let config: SoiiConfig
  try {
    config = loadConfig(root)
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    findings.push({ path: 'soii.config.yml', severity: 'error', rule: 'config-invalid', message: err.issues.join('; ') })
    config = resolveConfig({})
  }
  const known = knownTypes(config)
  const enums = enumTable()

  const { markdown, attachments, fsPaths, warnings } = walkVault(root, config.exclude)
  for (const w of warnings) {
    const path = w.slice(0, w.indexOf(': skipped'))
    findings.push({ path, severity: 'warning', rule: 'duplicate-note', message: w.slice(path.length + 2) })
  }

  const notePaths = new Set(markdown)
  const resolve = createLinkResolver([...markdown, ...attachments])
  const noteInfo = (p: string) => (notePaths.has(p) ? { id: stripMd(p), title: '', excerpt: '' } : null)
  // Link names to suggest for a broken link: note names without .md, attachment names as written.
  const linkNames = new Map<string, string>()
  for (const p of [...markdown, ...attachments]) {
    const name = notePaths.has(p) ? stripMd(posix.basename(p)) : posix.basename(p)
    if (!linkNames.has(name.toLowerCase())) linkNames.set(name.toLowerCase(), name)
  }

  let notes = 0
  const typed: { path: string; type: string | null; readable: boolean }[] = []
  for (const path of markdown) {
    const source = readFileSync(join(root, fsPaths.get(path) ?? path), 'utf8')
    const push: Push = f => findings.push({ path, ...f })

    if (decodeBase64Markdown(source) !== null) {
      notes++
      push({ severity: 'error', rule: 'base64-note', message: 'The whole note is base64-encoded text, so soii shows it as one long line.', fix: 'Replace the file with its decoded markdown (`base64 --decode`).' })
      continue
    }
    const parsed = parseFrontmatter(source)
    if (parsed.error && isHiddenYaml(splitFrontmatter(source).yaml ?? '')) continue // soii skips it either way
    const fields = deriveFields(parsed.data, path, config.types)
    if (fields.hidden) continue
    notes++

    if (parsed.error) {
      push({
        severity: 'error',
        rule: 'frontmatter-invalid',
        message: `The ${parsed.error}, so soii shows no properties for this note.`,
        fix: 'Quote values that contain ": " or " #" or start with [ { * & ! | > \' " % @ `, and check the indentation.'
      })
    } else {
      checkType(parsed.data, config, known, push)
      checkEnums(parsed.data, fields.type, enums, push)
      checkDates(parsed.data, push)
      checkNumbers(parsed.data, push)
      checkMissingFields(parsed.data, fields.type, push)
    }
    typed.push({ path, type: fields.type, readable: !parsed.error })

    const { missing } = renderMarkdown(parsed.body, { fromPath: path, resolve, noteInfo, tooLarge: () => false })
    const targets = [...new Set(missing.filter(Boolean))]
    if (targets.length) {
      const listed = targets.slice(0, MAX_LISTED_LINKS).map(t => `[[${t}]]`).join(', ')
      const more = targets.length > MAX_LISTED_LINKS ? ` (+${targets.length - MAX_LISTED_LINKS} more)` : ''
      const suggestions = targets.flatMap(t => {
        const near = closest(posix.basename(t), linkNames.keys())
        return near ? [`[[${t}]] → [[${linkNames.get(near)}]]`] : []
      })
      push({
        severity: 'warning',
        rule: 'broken-link',
        message: `${targets.length} broken link${targets.length === 1 ? '' : 's'}: ${listed}${more}`,
        targets,
        ...(suggestions.length ? { fix: suggestions.slice(0, MAX_LISTED_LINKS).join('; ') } : {})
      })
    }
  }

  // A note without a type in a folder where most notes share one probably wants it too.
  const byFolder = new Map<string, typeof typed>()
  for (const t of typed) byFolder.set(posix.dirname(t.path), [...(byFolder.get(posix.dirname(t.path)) ?? []), t])
  for (const siblings of byFolder.values()) {
    const counts = new Map<string, number>()
    for (const s of siblings) if (s.type) counts.set(s.type, (counts.get(s.type) ?? 0) + 1)
    const [top, count] = [...counts].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0] ?? ['', 0]
    if (count < 3 || count * 2 <= siblings.length) continue
    for (const s of siblings) {
      if (s.type || !s.readable) continue
      findings.push({ path: s.path, severity: 'info', rule: 'missing-type', message: `No \`type\`, but ${count} of the ${siblings.length} notes in this folder are \`type: ${top}\`.`, fix: `type: ${top}` })
    }
  }

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || cmp(a.path, b.path) || cmp(a.rule, b.rule) || cmp(a.field ?? '', b.field ?? '')
  )
  return { notes, findings }
}

export async function checkVault(root: string): Promise<Finding[]> {
  return (await inspectVault(root)).findings
}

// ---- Report --------------------------------------------------------------------------------

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

export function summaryLine({ notes, findings }: VaultCheck): string {
  const count = (s: Severity) => findings.filter(f => f.severity === s).length
  return `${plural(notes, 'note')} checked: ${plural(count('error'), 'error')}, ${plural(count('warning'), 'warning')}, ${count('info')} info.`
}

const MOST_MISSING = 5

/** "## Missing properties": how many notes of each type lack documented keys, and which keys most often. */
function missingFieldSummary(findings: Finding[]): string[] {
  const byType = new Map<string, { notes: number; fields: Map<string, number> }>()
  for (const f of findings) {
    if (f.rule !== 'missing-field' || !f.type) continue
    const entry = byType.get(f.type) ?? { notes: 0, fields: new Map<string, number>() }
    entry.notes++
    for (const field of f.fields ?? []) entry.fields.set(field, (entry.fields.get(field) ?? 0) + 1)
    byType.set(f.type, entry)
  }
  if (!byType.size) return []
  const total = [...byType.values()].reduce((n, e) => n + e.notes, 0)
  const rows = [...byType]
    .sort((a, b) => b[1].notes - a[1].notes || cmp(a[0], b[0]))
    .map(([type, { notes, fields }]) => {
      // Map keeps insertion order (the docs' field order), and sort is stable, so ties stay in that order.
      const top = [...fields].sort((a, b) => b[1] - a[1]).slice(0, MOST_MISSING).map(([k, n]) => `${k} (${n})`)
      return `| ${type} | ${notes} | ${top.join(', ')} |`
    })
  return [
    '',
    '## Missing properties',
    '',
    `${plural(total, 'note')} lack some of the properties docs/frontmatter.md lists for their type. soii reads them fine; \`/soii-setup\` adds them as empty keys.`,
    '',
    '| Type | Notes | Most often missing |',
    '|---|---|---|',
    ...rows
  ]
}

export function formatReport(check: VaultCheck): string {
  const lines = ['# Vault check', '', summaryLine(check)]
  const sections: [Severity, string][] = [['error', 'Errors'], ['warning', 'Warnings'], ['info', 'Info']]
  for (const [severity, title] of sections) {
    const group = check.findings.filter(f => f.severity === severity)
    if (!group.length) continue
    // One line per note would bury everything else when a vault has hundreds of notes without some key,
    // so missing-field gets a per-type summary below; `--json` still lists every note.
    const listed = group.filter(f => f.rule !== 'missing-field')
    if (!listed.length) continue
    lines.push('', `## ${title}`)
    let current = ''
    for (const f of listed) {
      if (f.path !== current) {
        lines.push('', `### ${f.path}`, '')
        current = f.path
      }
      lines.push(`- \`${f.rule}\` ${f.message}`)
      if (f.fix) lines.push(`  Fix: ${f.fix.includes('\n') ? f.fix : /^[\w-]+: /.test(f.fix) ? `\`${f.fix}\`` : f.fix}`)
    }
  }
  lines.push(...missingFieldSummary(check.findings))
  if (!check.findings.length) lines.push('', 'No problems found.')
  return `${lines.join('\n')}\n`
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const vaultDir = args.find(a => !a.startsWith('--'))
  if (!vaultDir) {
    console.error('Usage: bun scripts/check-vault.ts <vaultDir> [--json]')
    process.exit(2)
  }
  if (!existsSync(vaultDir) || !statSync(vaultDir).isDirectory()) {
    console.error(`Not a folder: ${vaultDir}`)
    process.exit(2)
  }
  const check = await inspectVault(vaultDir)
  if (args.includes('--json')) console.log(JSON.stringify(check.findings, null, 2))
  else process.stdout.write(formatReport(check))
  process.exit(check.findings.some(f => f.severity === 'error') ? 1 : 0)
}
