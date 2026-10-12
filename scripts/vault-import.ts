// Copies the notes of an existing vault into a soii vault (the first half of /soii-setup's import flow).
// Read-only on the source. Never overwrites a file in the destination: a clash is reported and the
// destination's file stays. Vault plumbing is left behind: .git (history stays in the old vault), .obsidian,
// .github, .claude, .soii, .trash, node_modules and .DS_Store. Modification times are kept.
//
//   bun scripts/vault-import.ts <sourceVault> <destVault> [--dry-run] [--json]
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync, utimesSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

const LEAVE_BEHIND = new Set(['.git', '.obsidian', '.github', '.claude', '.soii', '.trash', 'node_modules', '.DS_Store'])

export interface ImportReport {
  /** Vault-relative paths copied (or that would be, in a dry run). */
  copied: string[]
  /** Paths that already exist in the destination and were kept as they were. */
  conflicts: string[]
}

export function importVault(source: string, dest: string, options: { dryRun?: boolean } = {}): ImportReport {
  if (!existsSync(source) || !statSync(source).isDirectory()) throw new Error(`Not a folder: ${source}`)
  const from = realpathSync(source)
  const to = existsSync(dest) ? realpathSync(dest) : dest
  if (from === to) throw new Error('The source and the destination are the same folder.')
  if (to.startsWith(from + sep)) throw new Error('The destination is inside the source vault.')

  const report: ImportReport = { copied: [], conflicts: [] }
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (LEAVE_BEHIND.has(entry.name) || entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile()) {
        const rel = relative(from, full).split(sep).join('/')
        const target = join(dest, rel)
        if (existsSync(target)) {
          report.conflicts.push(rel)
          continue
        }
        report.copied.push(rel)
        if (options.dryRun) continue
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(full, target)
        const { atime, mtime } = statSync(full)
        utimesSync(target, atime, mtime)
      }
    }
  }
  visit(from)
  return report
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const [source, dest] = args.filter(a => !a.startsWith('--'))
  if (!source || !dest) {
    console.error('Usage: bun scripts/vault-import.ts <sourceVault> <destVault> [--dry-run] [--json]')
    process.exit(2)
  }
  let report: ImportReport
  try {
    report = importVault(source, dest, { dryRun: args.includes('--dry-run') })
  } catch (err) {
    console.error((err as Error).message)
    process.exit(2)
  }
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else {
    const verb = args.includes('--dry-run') ? 'Would copy' : 'Copied'
    console.log(`${verb} ${report.copied.length} files. ${report.conflicts.length} already existed and were kept.`)
    for (const c of report.conflicts) console.log(`  kept: ${c}`)
  }
}
