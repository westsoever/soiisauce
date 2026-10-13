// app/server/tex.e2e.test.ts
// Compiles with whatever TeX this machine has (spec §7). Skips, saying why, when there is none.
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTexCompiler, runProcess, type TexRunner } from './tex'
import { findTool, pickCompiler } from './tex-tools'

const find = (name: string) => findTool(name, process.env.PATH)
const compiler = pickCompiler('pdflatex', find)
if (!compiler) console.log('tex.e2e: skipped, no tectonic or pdflatex on PATH or in the TeX folders')

const temps: string[] = []
afterAll(() => temps.forEach(d => rmSync(d, { recursive: true, force: true })))
function vault(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'soii-tex-e2e-'))
  temps.push(dir)
  mkdirSync(join(dir, 'Papers'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'Papers', name), text)
  return { dir, cacheDir: join(dir, '.soii', 'cache', 'tex') }
}

describe.skipIf(!compiler)('real LaTeX', () => {
  test('a two-file document with a spaced name compiles, leaves the folder alone, then hits the cache', async () => {
    const { dir, cacheDir } = vault({
      'My Paper.tex': '\\documentclass{article}\n\\begin{document}\n\\input{part}\n\\end{document}\n',
      'part.tex': 'Hello from the part file.\n'
    })
    const before = readdirSync(join(dir, 'Papers')).sort()
    let runs = 0
    const run: TexRunner = (cmd, o) => {
      runs++
      return runProcess(cmd, o)
    }
    const tex = createTexCompiler({ vaultDir: dir, cacheDir, run, timeoutMs: 120_000 })
    const r = await tex.compile('Papers/My Paper.tex')
    if (!r.ok) throw new Error(JSON.stringify(r))
    expect(readFileSync(r.pdf).subarray(0, 5).toString()).toBe('%PDF-')
    expect(readdirSync(join(dir, 'Papers')).sort()).toEqual(before)
    const runsAfterFirst = runs
    const again = await tex.compile('Papers/My Paper.tex')
    expect(again).toEqual(r)
    expect(runs).toBe(runsAfterFirst)
  }, 150_000)

  test('shell escape stays off: \\write18 runs nothing', async () => {
    const { dir, cacheDir } = vault({
      'evil.tex': '\\documentclass{article}\n\\begin{document}\n\\immediate\\write18{touch pwned}\nx\n\\end{document}\n'
    })
    await createTexCompiler({ vaultDir: dir, cacheDir, timeoutMs: 120_000 }).compile('Papers/evil.tex')
    expect(existsSync(join(dir, 'Papers', 'pwned'))).toBe(false)
    expect(readdirSync(cacheDir).some(name => existsSync(join(cacheDir, name, 'pwned')))).toBe(false)
  }, 150_000)

  test('a document that never ends is stopped at the limit', async () => {
    const { dir, cacheDir } = vault({ 'loop.tex': '\\documentclass{article}\n\\begin{document}\n\\loop\\iftrue\\repeat\n\\end{document}\n' })
    const started = Date.now()
    const r = await createTexCompiler({ vaultDir: dir, cacheDir, timeoutMs: 3_000 }).compile('Papers/loop.tex')
    expect(r).toMatchObject({ ok: false, error: 'tex_timeout' })
    expect(Date.now() - started).toBeLessThan(15_000)
  }, 30_000)
})
