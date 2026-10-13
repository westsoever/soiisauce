// app/server/tex-tools.test.ts
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cacheKey, findTool, firstPass, folderStamps, laterPasses, parseTexLog, pickCompiler, type TexCompilerBin } from './tex-tools'

const temps: string[] = []
afterAll(() => temps.forEach(d => rmSync(d, { recursive: true, force: true })))
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-tex-tools-'))
  temps.push(d)
  return d
}

describe('findTool', () => {
  test('PATH first, then the TeX fallback folders', () => {
    const have = new Set(['/custom/bin/pdflatex', '/Library/TeX/texbin/pdflatex', '/Library/TeX/texbin/xelatex'])
    const exists = (p: string) => have.has(p)
    expect(findTool('pdflatex', '/custom/bin:/usr/bin', exists)).toBe('/custom/bin/pdflatex')
    expect(findTool('xelatex', '/custom/bin', exists)).toBe('/Library/TeX/texbin/xelatex')
    expect(findTool('tectonic', undefined, exists)).toBeNull()
  })
})

describe('pickCompiler', () => {
  test('tectonic wins, then the engine the document asks for; never latexmk', () => {
    const all = (name: string) => `/bin/${name}`
    expect(pickCompiler('xelatex', all)).toEqual({ tool: 'tectonic', bin: '/bin/tectonic' })
    const noTectonic = (name: string) => (name === 'tectonic' ? null : `/bin/${name}`)
    expect(pickCompiler('xelatex', noTectonic)).toEqual({ tool: 'xelatex', bin: '/bin/xelatex' })
    expect(pickCompiler('pdflatex', () => null)).toBeNull()
  })
})

const job = { file: 'main.tex', outDir: '/cache/k.tmp-1', engine: 'pdflatex' as const }
const pdflatex: TexCompilerBin = { tool: 'pdflatex', bin: '/tex/pdflatex' }
const tectonic: TexCompilerBin = { tool: 'tectonic', bin: '/bin/tectonic' }

describe('firstPass', () => {
  test('engines never get shell escape and write into the output folder', () => {
    expect(firstPass(pdflatex, job)).toEqual({
      cmd: ['/tex/pdflatex', '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', '-output-directory=/cache/k.tmp-1', 'main.tex'],
      cwd: 'source'
    })
  })
  test('tectonic runs untrusted', () => {
    expect(firstPass(tectonic, job)).toEqual({ cmd: ['/bin/tectonic', '-X', 'compile', '--untrusted', '--outdir', '/cache/k.tmp-1', 'main.tex'], cwd: 'source' })
  })
})

describe('laterPasses', () => {
  const engine = firstPass(pdflatex, job)
  test('nothing more for a simple document', () => expect(laterPasses(pdflatex, job, 'Hello', 'Output written', '/tex/bibtex')).toEqual([]))
  test('one more pass when LaTeX asks for a rerun or the document has a table of contents', () => {
    expect(laterPasses(pdflatex, job, 'x', 'LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.', null)).toEqual([engine])
    expect(laterPasses(pdflatex, job, '\\tableofcontents', '', null)).toEqual([engine])
  })
  test('bibtex in the output folder, then two engine passes', () => {
    expect(laterPasses(pdflatex, job, '\\bibliography{refs}', '', '/tex/bibtex')).toEqual([{ cmd: ['/tex/bibtex', 'main'], cwd: 'out' }, engine, engine])
  })
  test('a bibliography without bibtex installed falls back to the rerun rule', () => {
    expect(laterPasses(pdflatex, job, '\\bibliography{refs}', 'There were undefined references.', null)).toEqual([engine])
  })
  test('tectonic does its own reruns', () => expect(laterPasses(tectonic, job, '\\bibliography{refs}\\tableofcontents', 'Rerun to get', '/tex/bibtex')).toEqual([]))
})

describe('parseTexLog', () => {
  test('error lines plus the 4 after each, in order, without duplicates', () => {
    const log = ['This is pdfTeX', '(./main.tex', '! Undefined control sequence.', 'l.5 \\foo', '', 'more', 'context', 'after', '! Emergency stop.', 'l.9'].join('\n')
    expect(parseTexLog(log)).toEqual(['! Undefined control sequence.', 'l.5 \\foo', '', 'more', 'context', '! Emergency stop.', 'l.9'])
  })
  test('no ! lines: the last non-empty lines', () => {
    const log = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
    expect(parseTexLog(log, 3)).toEqual(['line 37', 'line 38', 'line 39'])
  })
})

describe('folderStamps and cacheKey', () => {
  test('stamps list non-dot files recursively, sorted, and stop at the limit', () => {
    const dir = tmp()
    mkdirSync(join(dir, 'fig'))
    mkdirSync(join(dir, '.git'))
    writeFileSync(join(dir, 'main.tex'), 'a')
    writeFileSync(join(dir, 'fig', 'p.png'), 'bb')
    writeFileSync(join(dir, '.git', 'HEAD'), 'x')
    const stamps = folderStamps(dir)
    expect(stamps.map(s => s.split(':')[0])).toEqual(['fig/p.png', 'main.tex'])
    expect(stamps[0]).toMatch(/^fig\/p\.png:2:\d+$/)
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `f${i}.txt`), 'x')
    expect(folderStamps(dir, 10)).toHaveLength(10)
  })

  test('the key changes with the source, a sibling file, or the tool', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'main.tex'), 'a')
    writeFileSync(join(dir, 'part.tex'), 'b')
    const base = { tool: 'pdflatex', engine: 'pdflatex', source: 'a', stamps: folderStamps(dir) }
    const k = cacheKey(base)
    expect(k).toMatch(/^[0-9a-f]{32}$/)
    expect(cacheKey({ ...base })).toBe(k)
    expect(cacheKey({ ...base, source: 'a2' })).not.toBe(k)
    expect(cacheKey({ ...base, tool: 'tectonic' })).not.toBe(k)
    utimesSync(join(dir, 'part.tex'), new Date(2000, 0, 1), new Date(2000, 0, 1))
    expect(cacheKey({ ...base, stamps: folderStamps(dir) })).not.toBe(k)
  })
})
