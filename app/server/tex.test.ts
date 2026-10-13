// app/server/tex.test.ts
// The compile orchestration with a fake runner: cache, sharing, failures, pruning (spec §4).
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTexCompiler, type TexRunner } from './tex'

const temps: string[] = []
afterAll(() => temps.forEach(d => rmSync(d, { recursive: true, force: true })))

function setup(files: Record<string, string> = { 'Papers/main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}' }) {
  const vault = mkdtempSync(join(tmpdir(), 'soii-tex-'))
  temps.push(vault)
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(vault, p, '..'), { recursive: true })
    writeFileSync(join(vault, p), text)
  }
  return { vault, cacheDir: join(vault, '.soii', 'cache', 'tex') }
}

const pdflatexOnly = (name: string) => (name === 'pdflatex' ? '/tex/pdflatex' : name === 'bibtex' ? '/tex/bibtex' : null)

/** Pretends to be pdflatex: writes <stem>.log (and <stem>.pdf unless told not to) into -output-directory. */
function fakeRun(o: { log?: string; pdf?: boolean; timedOut?: boolean; delayMs?: number } = {}) {
  const calls: { cmd: string[]; cwd: string; env: Record<string, string> }[] = []
  const run: TexRunner = async (cmd, { cwd, env }) => {
    calls.push({ cmd, cwd, env })
    if (o.delayMs) await Bun.sleep(o.delayMs)
    if (o.timedOut) return { code: null, output: '', timedOut: true }
    const outArg = cmd.find(a => a.startsWith('-output-directory='))
    if (outArg) {
      const out = outArg.slice('-output-directory='.length)
      const stem = cmd[cmd.length - 1].replace(/\.tex$/, '')
      writeFileSync(join(out, `${stem}.log`), o.log ?? 'This is pdfTeX\nOutput written on main.pdf')
      if (o.pdf !== false) writeFileSync(join(out, `${stem}.pdf`), '%PDF-1.5 fake')
    }
    return { code: o.pdf === false ? 1 : 0, output: 'stdout text', timedOut: false }
  }
  return { run, calls }
}

describe('createTexCompiler', () => {
  test('no compiler: says so and runs nothing', async () => {
    const { vault, cacheDir } = setup()
    const fake = fakeRun()
    const r = await createTexCompiler({ vaultDir: vault, cacheDir, run: fake.run, find: () => null }).compile('Papers/main.tex')
    expect(r).toMatchObject({ ok: false, error: 'tex_no_compiler' })
    expect(fake.calls).toHaveLength(0)
  })

  test('compiles in the source folder into the cache, then serves the cache', async () => {
    const { vault, cacheDir } = setup()
    const before = readdirSync(join(vault, 'Papers')).sort()
    const fake = fakeRun()
    const tex = createTexCompiler({ vaultDir: vault, cacheDir, run: fake.run, find: pdflatexOnly })
    const r = await tex.compile('Papers/main.tex')
    if (!r.ok) throw new Error(JSON.stringify(r))
    expect(r.tool).toBe('pdflatex')
    expect(r.pdf.startsWith(cacheDir)).toBe(true)
    expect(r.pdf.endsWith('/out.pdf')).toBe(true)
    expect(readFileSync(r.pdf, 'utf8')).toBe('%PDF-1.5 fake')
    expect(fake.calls[0].cwd).toBe(join(vault, 'Papers'))
    expect(fake.calls[0].cmd).toContain('-no-shell-escape')
    expect(fake.calls[0].env.openout_any).toBe('p')
    expect(readdirSync(join(vault, 'Papers')).sort()).toEqual(before)
    const again = await tex.compile('Papers/main.tex')
    expect(again).toEqual(r)
    expect(fake.calls).toHaveLength(1)
  })

  test('two requests at once share one compile', async () => {
    const { vault, cacheDir } = setup()
    const fake = fakeRun({ delayMs: 50 })
    const tex = createTexCompiler({ vaultDir: vault, cacheDir, run: fake.run, find: pdflatexOnly })
    const [a, b] = await Promise.all([tex.compile('Papers/main.tex'), tex.compile('Papers/main.tex')])
    expect(a).toEqual(b)
    expect(fake.calls).toHaveLength(1)
  })

  test('a LaTeX error returns the log excerpt and caches nothing', async () => {
    const { vault, cacheDir } = setup()
    const fake = fakeRun({ pdf: false, log: 'This is pdfTeX\n! Undefined control sequence.\nl.3 \\foo\n' })
    const r = await createTexCompiler({ vaultDir: vault, cacheDir, run: fake.run, find: pdflatexOnly }).compile('Papers/main.tex')
    expect(r).toEqual({ ok: false, error: 'tex_failed', tool: 'pdflatex', log: ['! Undefined control sequence.', 'l.3 \\foo', ''] })
    expect(existsSync(cacheDir) ? readdirSync(cacheDir) : []).toEqual([])
  })

  test('a compile that runs out of time is a timeout and leaves nothing behind', async () => {
    const { vault, cacheDir } = setup()
    const r = await createTexCompiler({ vaultDir: vault, cacheDir, run: fakeRun({ timedOut: true }).run, find: pdflatexOnly }).compile('Papers/main.tex')
    expect(r).toMatchObject({ ok: false, error: 'tex_timeout' })
    expect(existsSync(cacheDir) ? readdirSync(cacheDir) : []).toEqual([])
  })

  test('a file that is gone is tex_missing, not a crash', async () => {
    const { vault, cacheDir } = setup()
    const r = await createTexCompiler({ vaultDir: vault, cacheDir, run: fakeRun().run, find: pdflatexOnly }).compile('Papers/gone.tex')
    expect(r).toMatchObject({ ok: false, error: 'tex_missing' })
  })

  test('an edit compiles again and prunes the old cache entry for that file only', async () => {
    const { vault, cacheDir } = setup({ 'Papers/main.tex': 'v1', 'Other/b.tex': 'b' })
    const fake = fakeRun()
    const tex = createTexCompiler({ vaultDir: vault, cacheDir, run: fake.run, find: pdflatexOnly })
    const first = await tex.compile('Papers/main.tex')
    await tex.compile('Other/b.tex')
    writeFileSync(join(vault, 'Papers', 'main.tex'), 'v2')
    const second = await tex.compile('Papers/main.tex')
    if (!first.ok || !second.ok) throw new Error('expected success')
    expect(second.pdf).not.toBe(first.pdf)
    expect(existsSync(first.pdf)).toBe(false)
    expect(readdirSync(cacheDir)).toHaveLength(2)
    expect(fake.calls).toHaveLength(3)
  })

  test('a bibliography runs bibtex in the output folder between engine passes', async () => {
    const { vault, cacheDir } = setup({ 'Papers/main.tex': '\\bibliography{refs}', 'Papers/refs.bib': '' })
    const fake = fakeRun()
    await createTexCompiler({ vaultDir: vault, cacheDir, run: fake.run, find: pdflatexOnly }).compile('Papers/main.tex')
    expect(fake.calls.map(c => c.cmd[0])).toEqual(['/tex/pdflatex', '/tex/bibtex', '/tex/pdflatex', '/tex/pdflatex'])
    expect(fake.calls[1].cwd).toContain(cacheDir)
    expect(fake.calls[1].env.BIBINPUTS.startsWith(join(vault, 'Papers'))).toBe(true)
  })
})
