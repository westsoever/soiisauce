// app/vault/compile-tex.test.ts
// .tex files compile into notes with format "tex" (spec §3).
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import MiniSearch from 'minisearch'
import { noteFileName } from '../lib/note-file'
import { SEARCH_OPTIONS } from '../lib/search-options'
import type { NoteDoc } from '../lib/types'
import { compileVault } from './compile'

const temps: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-compile-tex-'))
  temps.push(d)
  return d
}
afterAll(() => temps.forEach(d => rmSync(d, { recursive: true, force: true })))

const THESIS = '\\documentclass{article}\n\\title{On Quiet Rooms}\n\\begin{document}\n\\maketitle\nSilence is underrated.\n\\end{document}\n'
const vault = tmp()
for (const [path, text] of Object.entries({
  'Papers/thesis.tex': THESIS,
  'Papers/thesis.md': '# Thesis notes\n\nSee [[thesis.tex]].\n',
  'Big.tex': 'x'.repeat(500)
})) {
  mkdirSync(dirname(join(vault, path)), { recursive: true })
  writeFileSync(join(vault, path), text)
}
const out = tmp()
const result = await compileVault({ vaultDir: vault, outDir: out, maxFileBytes: 400 })
const doc = (id: string) => JSON.parse(readFileSync(join(out, 'notes', noteFileName(id)), 'utf8')) as NoteDoc

describe('compileVault with .tex files', () => {
  test('a .tex is a note next to the .md of the same name, sorted by path', () => {
    expect(result.index.notes.map(n => n.id)).toEqual(['Papers/thesis', 'Papers/thesis.tex'])
  })

  test('its meta carries format "tex" and the LaTeX title, but not the source', () => {
    const meta = result.index.notes.find(n => n.id === 'Papers/thesis.tex')!
    expect(meta).toMatchObject({ title: 'On Quiet Rooms', format: 'tex', folder: 'Papers', type: null, path: 'Papers/thesis.tex' })
    expect('source' in meta).toBe(false)
    expect(readFileSync(join(out, 'index.json'), 'utf8')).not.toContain('documentclass')
  })

  test('its doc carries the raw source and no html', () => {
    const d = doc('Papers/thesis.tex')
    expect(d.source).toBe(THESIS)
    expect(d.html).toBe('')
    expect(d.headings).toEqual([])
    expect(d.outgoing).toEqual([])
  })

  test('[[thesis.tex]] links to it and gives it a backlink', () => {
    const md = doc('Papers/thesis')
    expect(md.outgoing).toEqual(['Papers/thesis.tex'])
    expect(md.html).toContain('href="/n/Papers/thesis.tex"')
    expect(doc('Papers/thesis.tex').backlinks).toEqual(['Papers/thesis'])
  })

  test('it is in the folder tree and in search', () => {
    expect(result.index.folders.folders.find(f => f.name === 'Papers')?.notes).toEqual(['Papers/thesis', 'Papers/thesis.tex'])
    const search = MiniSearch.loadJSON(readFileSync(join(out, 'search.json'), 'utf8'), SEARCH_OPTIONS)
    expect(search.search('underrated').map(r => r.id)).toContain('Papers/thesis.tex')
  })

  test('an oversize .tex is skipped with a warning', () => {
    expect(result.index.notes.some(n => n.id === 'Big.tex')).toBe(false)
    expect(result.warnings.some(w => w.startsWith('Big.tex: skipped'))).toBe(true)
  })
})
