// app/server/tex.ts
// Compiles a vault .tex to PDF on click (spec: .tex viewer §4). Runs in the source's folder,
// writes only into <vault>/.soii/cache/tex/<key>/, shares in-flight compiles, never enables shell escape.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, delimiter, dirname, join } from 'node:path'
import { texEngine } from '../vault/tex'
import { cacheKey, findTool, firstPass, folderStamps, laterPasses, parseTexLog, pickCompiler, type TexPass, type TexTool } from './tex-tools'

export interface RunResult {
  code: number | null
  output: string
  timedOut: boolean
}

export type TexRunner = (cmd: string[], opts: { cwd: string; env: Record<string, string>; timeoutMs: number }) => Promise<RunResult>

export type TexResult =
  | { ok: true; pdf: string; tool: TexTool }
  | { ok: false; error: 'tex_failed'; tool: TexTool; log: string[] }
  | { ok: false; error: 'tex_no_compiler' | 'tex_timeout' | 'tex_missing'; message: string }

export interface TexCompiler {
  compile(path: string): Promise<TexResult>
}

export const NO_COMPILER_MESSAGE =
  'No LaTeX compiler found. Install one with `brew install tectonic` (small, fetches packages as needed) or MacTeX, then reopen this file.'
const TIMEOUT_MESSAGE = 'LaTeX took longer than 30 seconds, so soii stopped it.'
const MISSING_MESSAGE = "This file isn't in the vault anymore."

/** Runs one command, killing it at the deadline. Resolves on timeout even if the pipes stay open. */
export const runProcess: TexRunner = (cmd, { cwd, env, timeoutMs }) =>
  new Promise(resolve => {
    const proc = Bun.spawn(cmd, { cwd, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve({ code: null, output: '', timedOut: true })
    }, timeoutMs)
    Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]).then(([out, err, code]) => {
      clearTimeout(timer)
      resolve({ code, output: `${out}\n${err}`, timedOut: false })
    })
  })

export function createTexCompiler(o: {
  vaultDir: string
  cacheDir: string
  run?: TexRunner
  find?: (name: string) => string | null
  timeoutMs?: number
}): TexCompiler {
  const run = o.run ?? runProcess
  const find = o.find ?? ((name: string) => findTool(name, process.env.PATH))
  const timeoutMs = o.timeoutMs ?? 30_000
  const inFlight = new Map<string, Promise<TexResult>>()

  const prune = (keep: string, path: string) => {
    for (const name of readdirSync(o.cacheDir)) {
      if (name === keep || name.includes('.tmp-')) continue
      const marker = join(o.cacheDir, name, 'source.txt')
      if (existsSync(marker) && readFileSync(marker, 'utf8') === path) rmSync(join(o.cacheDir, name), { recursive: true, force: true })
    }
  }

  const build = async (path: string, key: string, source: string, srcDir: string): Promise<TexResult> => {
    const engine = texEngine(source)
    const compiler = pickCompiler(engine, find)
    if (!compiler) return { ok: false, error: 'tex_no_compiler', message: NO_COMPILER_MESSAGE }
    mkdirSync(o.cacheDir, { recursive: true })
    for (const name of readdirSync(o.cacheDir)) if (name.startsWith(`${key}.tmp-`)) rmSync(join(o.cacheDir, name), { recursive: true, force: true })
    const tmp = join(o.cacheDir, `${key}.tmp-${crypto.randomUUID().slice(0, 8)}`)
    mkdirSync(tmp)
    const file = basename(path)
    const stem = file.replace(/\.tex$/i, '')
    const job = { file, outDir: tmp, engine }
    const env = { ...(process.env as Record<string, string>), openout_any: 'p', TEXMFOUTPUT: tmp, BIBINPUTS: `${srcDir}${delimiter}` }
    const deadline = Date.now() + timeoutMs
    const fail = (r: TexResult): TexResult => {
      rmSync(tmp, { recursive: true, force: true })
      return r
    }
    const exec = (pass: TexPass) => run(pass.cmd, { cwd: pass.cwd === 'out' ? tmp : srcDir, env, timeoutMs: Math.max(0, deadline - Date.now()) })
    const logOf = (r: RunResult) => {
      const logFile = join(tmp, `${stem}.log`)
      return existsSync(logFile) ? readFileSync(logFile, 'latin1') : r.output
    }

    const first = await exec(firstPass(compiler, job))
    if (first.timedOut) return fail({ ok: false, error: 'tex_timeout', message: TIMEOUT_MESSAGE })
    if (first.code !== 0) return fail({ ok: false, error: 'tex_failed', tool: compiler.tool, log: parseTexLog(logOf(first)) })
    for (const pass of laterPasses(compiler, job, source, logOf(first), find('bibtex'))) {
      if (Date.now() >= deadline) return fail({ ok: false, error: 'tex_timeout', message: TIMEOUT_MESSAGE })
      const r = await exec(pass)
      if (r.timedOut) return fail({ ok: false, error: 'tex_timeout', message: TIMEOUT_MESSAGE })
      // bibtex exits 1 on mere warnings; only an engine failure stops the compile.
      if (r.code !== 0 && pass.cwd === 'source') return fail({ ok: false, error: 'tex_failed', tool: compiler.tool, log: parseTexLog(logOf(r)) })
    }
    const pdf = join(tmp, `${stem}.pdf`)
    if (!existsSync(pdf)) return fail({ ok: false, error: 'tex_failed', tool: compiler.tool, log: parseTexLog(logOf(first)) })
    renameSync(pdf, join(tmp, 'out.pdf'))
    writeFileSync(join(tmp, 'source.txt'), path)
    const dir = join(o.cacheDir, key)
    rmSync(dir, { recursive: true, force: true })
    renameSync(tmp, dir)
    prune(key, path)
    return { ok: true, pdf: join(dir, 'out.pdf'), tool: compiler.tool }
  }

  return {
    async compile(path) {
      const srcFile = join(o.vaultDir, path)
      if (path.split('/').includes('..') || !existsSync(srcFile)) return { ok: false, error: 'tex_missing', message: MISSING_MESSAGE }
      const source = readFileSync(srcFile, 'utf8')
      const srcDir = dirname(srcFile)
      const engine = texEngine(source)
      const compiler = pickCompiler(engine, find)
      if (!compiler) return { ok: false, error: 'tex_no_compiler', message: NO_COMPILER_MESSAGE }
      const key = cacheKey({ tool: compiler.tool, engine, source, stamps: folderStamps(srcDir) })
      const hit = join(o.cacheDir, key, 'out.pdf')
      if (existsSync(hit)) return { ok: true, pdf: hit, tool: compiler.tool }
      const running = inFlight.get(key)
      if (running) return running
      const p = build(path, key, source, srcDir).finally(() => inFlight.delete(key))
      inFlight.set(key, p)
      return p
    }
  }
}
