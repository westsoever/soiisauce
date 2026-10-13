// app/server/tex-tools.ts
// The pieces of compiling LaTeX that don't run anything: finding a compiler, the command for
// each pass, reading the log, and the cache key. Every command refuses shell escape.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { TexEngine } from '../vault/tex'

/** Where TeX lives when the LaunchAgent's PATH doesn't say (MacTeX, Homebrew, Linux). */
export const TEX_FALLBACK_DIRS = ['/Library/TeX/texbin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']

export function findTool(name: string, pathEnv: string | undefined, exists: (p: string) => boolean = existsSync): string | null {
  const dirs = [...(pathEnv ?? '').split(delimiter).filter(Boolean), ...TEX_FALLBACK_DIRS]
  for (const dir of dirs) {
    const candidate = join(dir, name)
    if (exists(candidate)) return candidate
  }
  return null
}

export type TexTool = 'tectonic' | TexEngine

export interface TexCompilerBin {
  tool: TexTool
  bin: string
}

/** tectonic if installed, else the engine the document wants. Not latexmk: its child engine can outlive our kill. */
export function pickCompiler(engine: TexEngine, find: (name: string) => string | null): TexCompilerBin | null {
  for (const tool of ['tectonic', engine] as const) {
    const bin = find(tool)
    if (bin) return { tool, bin }
  }
  return null
}

export interface TexJob {
  /** The source's file name, e.g. "main.tex"; the command runs in its folder. */
  file: string
  outDir: string
  engine: TexEngine
}

export interface TexPass {
  cmd: string[]
  /** Run in the source's folder or in the output folder (bibtex reads the .aux there). */
  cwd: 'source' | 'out'
}

export function firstPass(c: TexCompilerBin, job: TexJob): TexPass {
  if (c.tool === 'tectonic') return { cmd: [c.bin, '-X', 'compile', '--untrusted', '--outdir', job.outDir, job.file], cwd: 'source' }
  return {
    cmd: [c.bin, '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', `-output-directory=${job.outDir}`, job.file],
    cwd: 'source'
  }
}

const RERUN_LOG = /Rerun to get|There were undefined references/
const RERUN_SOURCE = /\\(tableofcontents|listoffigures|listoftables)\b/

/** What runs after a successful first pass. Tectonic reruns by itself. */
export function laterPasses(c: TexCompilerBin, job: TexJob, source: string, firstLog: string, bibtex: string | null): TexPass[] {
  if (c.tool === 'tectonic') return []
  const engine = firstPass(c, job)
  if (bibtex && /\\bibliography\s*\{/.test(source)) return [{ cmd: [bibtex, job.file.replace(/\.tex$/i, '')], cwd: 'out' }, engine, engine]
  if (RERUN_LOG.test(firstLog) || RERUN_SOURCE.test(source)) return [engine]
  return []
}

/** The useful part of a TeX log: each "!" error line and the 4 after it; else the last lines. */
export function parseTexLog(log: string, max = 30): string[] {
  const lines = log.split(/\r?\n/)
  const keep = new Set<number>()
  lines.forEach((line, i) => {
    if (line.startsWith('!')) for (let j = i; j < Math.min(i + 5, lines.length); j++) keep.add(j)
  })
  const picked = keep.size ? [...keep].sort((a, b) => a - b).map(i => lines[i]) : lines.filter(l => l.trim()).slice(-max)
  return picked.slice(0, max)
}

/** "path:size:mtime" for every non-dot file under `dir`, sorted. Stops at `limit` (a .tex at the vault root). */
export function folderStamps(dir: string, limit = 2000): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (out.length >= limit) return
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) {
        const s = statSync(join(dir, path))
        out.push(`${path}:${s.size}:${Math.floor(s.mtimeMs)}`)
      }
    }
  }
  walk('')
  return out.sort()
}

export function cacheKey(parts: { tool: string; engine: string; source: string; stamps: string[] }): string {
  return createHash('sha256')
    .update([parts.tool, parts.engine, parts.source, ...parts.stamps].join('\0'))
    .digest('hex')
    .slice(0, 32)
}
