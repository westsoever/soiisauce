// Fills in the documented properties of a vault's typed notes, the mechanical part of /soii-setup.
// For every note whose `type` has a field table (app/lib/type-fields.ts, from docs/frontmatter.md) it
//   - adds each documented key the note lacks, as an empty key (`rating:`),
//   - fills the few values that can be worked out safely: `author` from a "Title — Author" file name,
//     `last_contact` from the newest dated list item, `cadence` from the relationship default (D65),
//     `created` from the first git commit that added the file,
//   - types an untyped note when its folder was mapped (`--type Reading/=book`).
// It never overwrites a value, never guesses status, rating, amounts or dates, never touches body text
// (apart from `--sections`, which appends an empty tracking heading) and never renames, moves or deletes a
// note. `title` is not written: soii takes it from the file name, and a stored copy goes stale when the
// note is renamed in Obsidian. Dry run unless `--write`. It does not commit; commit per folder with `--only`.
//
//   bun scripts/vault-normalise.ts <vaultDir> [--write] [--type <folder/>=<type>]... [--only <folder/>]
//                                  [--sections] [--history <dir>] [--json]
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConfigError } from '../app/lib/config-schema'
import { resolveConfig } from '../app/lib/merge-config'
import { cadenceDefaults, cadenceToStamp, latestDatedEntry } from '../app/lib/people'
import { canonicalType } from '../app/lib/query'
import { setProperty } from '../app/lib/property-edit'
import { expectedFields } from '../app/lib/type-fields'
import type { NoteMeta, SoiiConfig } from '../app/lib/types'
import { loadConfig } from '../app/vault/compile'
import { deriveFields, isHiddenYaml, parseFrontmatter, splitFrontmatter } from '../app/vault/frontmatter'
import { walkVault } from '../app/vault/walk'
import { decodeBase64Markdown } from './find-base64-notes'

export type ChangeHow = 'mapped' | 'empty' | 'derived' | 'section'
export interface Change {
  key: string
  value: string | number | null
  how: ChangeHow
}

export interface PlanInput {
  source: string
  /** Vault-relative, "/"-separated. */
  path: string
  config: SoiiConfig
  /** Per-relationship check-in days (`cadenceDefaults(config)`). */
  cadences: Record<string, number>
  /** YYYY-MM-DD; dated lines after it don't count as contact. */
  today: string
  /** The type to give an untyped note (from the folder mapping). */
  mapType?: string
  /** Date the file was first committed. */
  created?: string | null
  /** Append the empty tracking heading. */
  sections?: boolean
}

export type Plan = { content: string; changes: Change[] } | { unchanged: true } | { skipped: string }

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

/** "Frank Herbert" from "Dune — Frank Herbert" (spaced em or en dash, never a hyphen). Null unless the tail reads as a name. */
export function authorFromFileName(name: string): string | null {
  const parts = name.split(/ [—–] /)
  if (parts.length !== 2) return null
  const author = parts[1].trim()
  const words = author.split(/\s+/)
  if (words.length > 4 || !words.every(w => /^\p{Lu}[\p{L}'’.-]*$/u.test(w))) return null
  return author
}

const fileStem = (path: string) => (path.split('/').pop() ?? path).replace(/\.md$/i, '')

function derive(key: string, type: string, data: Record<string, unknown>, input: PlanInput): string | number | null {
  if (key === 'author' && (type === 'book' || type === 'audiobook')) return authorFromFileName(fileStem(input.path))
  if (key === 'last_contact' && type === 'person') return latestDatedEntry(parseFrontmatter(input.source).body, input.today)
  if (key === 'cadence' && type === 'person') {
    // Only for a note with no `cadence` key at all: a bare `cadence:` means "use the default" (D65).
    if (key in data) return null
    const stamp = cadenceToStamp({ frontmatter: data } as NoteMeta, data.relationship, input.cadences)
    return stamp !== null && /^\d+$/.test(stamp) ? Number(stamp) : stamp // `cadence: 60`, not `"60"`
  }
  return null
}

export function planNote(input: PlanInput): Plan {
  const { source } = input
  if (decodeBase64Markdown(source) !== null) return { skipped: 'base64' }
  const parsed = parseFrontmatter(source)
  if (parsed.error) return { skipped: isHiddenYaml(splitFrontmatter(source).yaml ?? '') ? 'hidden' : 'unreadable frontmatter' }
  const fields = deriveFields(parsed.data, input.path, input.config.types)
  if (fields.hidden) return { skipped: 'hidden' }

  const data = parsed.data as Record<string, unknown>
  const mapped = fields.type === null && input.mapType ? canonicalType(input.mapType, input.config.types) : null
  const type = fields.type ?? mapped
  if (!type) return { unchanged: true }

  const wanted: Change[] = []
  if (mapped) wanted.push({ key: 'type', value: input.mapType!, how: 'mapped' })
  for (const key of expectedFields(type)) {
    const derived = isBlank(data[key]) ? derive(key, type, data, input) : null
    if (derived !== null) wanted.push({ key, value: derived, how: 'derived' })
    else if (!(key in data) && !wanted.some(c => c.key === key)) wanted.push({ key, value: null, how: 'empty' })
  }
  const tracked = expectedFields(type).length > 0
  if (tracked && input.created && !('created' in data)) wanted.push({ key: 'created', value: input.created, how: 'derived' })

  let content = source
  for (const change of wanted) {
    const result = setProperty(content, change.key, change.value)
    if (!result.ok) return { skipped: 'unreadable frontmatter' }
    content = result.content
  }

  const changes = [...wanted]
  if (input.sections && tracked) {
    const heading = type === 'person' ? '## Notes & dated interactions' : '## Log'
    const has = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\r?$`, 'm')
    if (!has.test(content)) {
      const eol = content.includes('\r\n') ? '\r\n' : '\n'
      content = `${content.replace(/(\r?\n)+$/, '')}${eol}${eol}${heading}${eol}`
      changes.push({ key: heading, value: null, how: 'section' })
    }
  }
  return content === source ? { unchanged: true } : { content, changes }
}

// ---- The vault -----------------------------------------------------------------------------

/** First-commit date of every file in the repo at `dir` (empty when it isn't one). Keys are NFC vault paths. */
export function gitCreatedDates(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const r = Bun.spawnSync(['git', '-C', dir, '-c', 'core.quotepath=off', 'log', '--diff-filter=A', '--no-renames', '--name-only', '--format=@@%as'], { stdout: 'pipe', stderr: 'pipe' })
  if (r.exitCode !== 0) return out
  let day = ''
  // Newest commit first, so a later (older) add overwrites: the first commit that added the file wins.
  for (const line of r.stdout.toString().split('\n')) {
    if (line.startsWith('@@')) day = line.slice(2)
    else if (line && day) out.set(line.normalize('NFC'), day)
  }
  return out
}

export interface NormaliseOptions {
  write?: boolean
  /** Folder prefix → type, for notes that have no type yet. The longest matching prefix wins. */
  typeMap?: [string, string][]
  /** Only notes under this folder prefix. */
  only?: string
  sections?: boolean
  /** Repo to read first-commit dates from (default: the vault itself). */
  historyDir?: string
  today?: string
}

export interface NormaliseReport {
  written: boolean
  notes: number
  changed: { path: string; changes: Change[] }[]
  skipped: { path: string; reason: string }[]
}

const withSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`)
const localToday = () => new Date().toLocaleDateString('sv-SE')

export async function normaliseVault(root: string, options: NormaliseOptions = {}): Promise<NormaliseReport> {
  let config: SoiiConfig
  try {
    config = loadConfig(root)
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    config = resolveConfig({})
  }
  const cadences = cadenceDefaults(config)
  const today = options.today ?? localToday()
  const typeMap = [...(options.typeMap ?? [])].map(([p, t]) => [withSlash(p), t] as const).sort((a, b) => b[0].length - a[0].length)
  const created = gitCreatedDates(options.historyDir ?? root)
  const only = options.only ? withSlash(options.only) : ''

  const { markdown, fsPaths } = walkVault(root, config.exclude)
  const report: NormaliseReport = { written: Boolean(options.write), notes: 0, changed: [], skipped: [] }
  for (const path of markdown) {
    if (only && !path.startsWith(only)) continue
    report.notes++
    const file = join(root, fsPaths.get(path) ?? path)
    const source = readFileSync(file, 'utf8')
    const plan = planNote({
      source,
      path,
      config,
      cadences,
      today,
      mapType: typeMap.find(([prefix]) => path.startsWith(prefix))?.[1],
      created: created.get(path) ?? null,
      sections: options.sections
    })
    if ('skipped' in plan) report.skipped.push({ path, reason: plan.skipped })
    else if ('content' in plan) {
      if (options.write) writeFileSync(file, plan.content)
      report.changed.push({ path, changes: plan.changes })
    }
  }
  return report
}

// ---- CLI -----------------------------------------------------------------------------------

function summarise(report: NormaliseReport): string {
  const counts = new Map<string, number>()
  for (const c of report.changed.flatMap(n => n.changes)) counts.set(c.how, (counts.get(c.how) ?? 0) + 1)
  const lines = [
    `${report.written ? 'Changed' : 'Would change'} ${report.changed.length} of ${report.notes} notes (${[...counts].map(([how, n]) => `${n} ${how}`).join(', ') || 'nothing to do'}).`
  ]
  for (const n of report.changed) lines.push(`  ${n.path}: ${n.changes.map(c => c.key).join(', ')}`)
  if (report.skipped.length) {
    lines.push(`Skipped ${report.skipped.length}:`)
    for (const s of report.skipped) lines.push(`  ${s.path}: ${s.reason}`)
  }
  if (!report.written && report.changed.length) lines.push('', 'Dry run. Add --write to apply.')
  return `${lines.join('\n')}\n`
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const value = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []))
  const flagValues = new Set(['--type', '--only', '--history'].flatMap(f => value(f)))
  const vaultDir = args.find(a => !a.startsWith('--') && !flagValues.has(a))
  if (!vaultDir) {
    console.error('Usage: bun scripts/vault-normalise.ts <vaultDir> [--write] [--type <folder/>=<type>]... [--only <folder/>] [--sections] [--history <dir>] [--json]')
    process.exit(2)
  }
  if (!existsSync(vaultDir) || !statSync(vaultDir).isDirectory()) {
    console.error(`Not a folder: ${vaultDir}`)
    process.exit(2)
  }
  const typeMap = value('--type').map(v => {
    const i = v.lastIndexOf('=')
    if (i < 1 || i === v.length - 1) {
      console.error(`--type needs <folder/>=<type>, got "${v}"`)
      process.exit(2)
    }
    return [v.slice(0, i), v.slice(i + 1)] as [string, string]
  })
  const report = await normaliseVault(vaultDir, {
    write: args.includes('--write'),
    typeMap,
    only: value('--only')[0],
    sections: args.includes('--sections'),
    historyDir: value('--history')[0]
  })
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else process.stdout.write(summarise(report))
}
