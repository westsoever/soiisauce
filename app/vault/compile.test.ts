// app/vault/compile.test.ts
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import MiniSearch from 'minisearch'
import { ConfigError } from '../lib/config-schema'
import { noteFileName } from '../lib/note-file'
import { SEARCH_OPTIONS } from '../lib/search-options'
import type { NoteDoc } from '../lib/types'
import { buildFolderTree, compileVault } from './compile'

const VAULT = join(import.meta.dir, '__fixtures__', 'vault')
const temps: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-compile-'))
  temps.push(d)
  return d
}
afterAll(() => temps.forEach(d => rmSync(d, { recursive: true, force: true })))

const out = tmp()
const result = await compileVault({ vaultDir: VAULT, outDir: out, maxFileBytes: 200 })
const doc = (id: string) => JSON.parse(readFileSync(join(out, 'notes', noteFileName(id)), 'utf8')) as NoteDoc
const meta = (id: string) => result.index.notes.find(n => n.id === id)!

describe('compileVault on the fixture vault', () => {
  test('includes the right notes, sorted by path', () => {
    expect(result.index.notes.map(n => n.id)).toEqual([
      'Archive/People/Anna',
      'Books/Bad Yaml',
      'Books/Dune',
      'Daily/2026-10-06',
      'Encoded',
      'People/Anna',
      'Weird/Café & ? 100%',
      'index'
    ])
  })

  test('config from soii.config.yml is merged over defaults', () => {
    expect(result.index.config.title).toBe('Fixture')
    expect(result.index.config.types.book).toEqual(['book', 'books', 'novel'])
    expect(result.index.config.workspaces.map(w => w.id)).toContain('library')
  })

  test('derived fields', () => {
    expect(meta('Books/Dune')).toMatchObject({ type: 'book', title: 'Dune', image: '/api/files/assets/cover.svg', folder: 'Books' })
    expect(meta('Daily/2026-10-06')).toMatchObject({ date: '2026-10-06', title: '2026-10-06', type: null })
    expect(meta('People/Anna')).toMatchObject({ date: '2026-07-26', type: 'person' })
    expect(meta('index').tags).toEqual(['home', 'inline-tag'])
    expect(meta('Books/Bad Yaml')).toMatchObject({ frontmatter: {}, title: 'Bad Yaml' })
  })

  test('links, backlinks and duplicate basenames', () => {
    const index = doc('index')
    expect(index.outgoing).toContain('People/Anna')
    expect(index.outgoing).toContain('Books/Dune')
    expect(index.outgoing).not.toContain('Archive/People/Anna')
    expect(index.html).toContain('href="/n/Weird/Caf%C3%A9%20%26%20%3F%20100%25"')
    expect(doc('People/Anna').backlinks).toEqual(['index'])
    expect(doc('Books/Dune').headings).toEqual([{ depth: 2, text: 'Plot', slug: 'plot' }])
  })

  test('html safety and Obsidian syntax survive end to end', () => {
    const html = doc('index').html
    expect(html).not.toContain('<script')
    expect(html).toContain('class="callout"')
    expect(html).toContain('data-plugin="dataview"')
    expect(html).toContain('file too large for soii')
    expect(doc('Books/Bad Yaml').html).toContain('Body survives.')
    expect(doc('Encoded').html).toContain('LS0t')
    expect(doc('Weird/Café & ? 100%').html).toContain('unicode body')
  })

  test('warnings: bad YAML, oversize file, missing links', () => {
    const w = result.warnings.join('\n')
    expect(w).toContain('Books/Bad Yaml.md: frontmatter is not valid YAML')
    expect(w).toContain('assets/huge.svg')
    expect(w).toMatch(/2 wikilinks point to notes that don't exist/)
    expect(w).toContain('index.md: [[Missing Note]]')
    expect(w).toContain('People/Anna.md: [[Erica]]')
    expect(result.index.warnings).toEqual(result.warnings)
  })

  test('only referenced, small attachments are copied; hidden and excluded notes are not written', () => {
    expect(existsSync(join(out, 'files', 'assets', 'cover.svg'))).toBe(true)
    expect(existsSync(join(out, 'files', 'assets', 'unused.svg'))).toBe(false)
    expect(existsSync(join(out, 'files', 'assets', 'huge.svg'))).toBe(false)
    expect(existsSync(join(out, 'notes', noteFileName('Hidden')))).toBe(false)
    expect(existsSync(join(out, 'notes', noteFileName('Private/secret')))).toBe(false)
  })

  test('index.json, meta.json and search.json are written', () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    expect(index.notes).toHaveLength(8)
    const metaJson = JSON.parse(readFileSync(join(out, 'meta.json'), 'utf8'))
    expect(typeof metaJson.builtAt).toBe('string')
    const ms = MiniSearch.loadJSON(readFileSync(join(out, 'search.json'), 'utf8'), SEARCH_OPTIONS)
    expect(ms.search('briefing')[0].id).toBe('Daily/2026-10-06')
    expect(ms.search('spice')[0].id).toBe('Books/Dune')
  })

  test('folder tree', () => {
    const tree = buildFolderTree(result.index.notes)
    expect(tree.notes).toEqual(['Encoded', 'index'])
    expect(tree.folders.map(f => f.name)).toEqual(['Archive', 'Books', 'Daily', 'People', 'Weird'])
    expect(tree.folders[0].folders[0]).toMatchObject({ name: 'People', path: 'Archive/People', notes: ['Archive/People/Anna'] })
  })
})

describe('compileVault failures', () => {
  test('a config typo fails with the YAML path', async () => {
    const vault = tmp()
    writeFileSync(join(vault, 'soii.config.yml'), 'workspaces:\n  - id: x\n    title: X\n    tabs:\n      - { id: a, title: A, view: galery, query: {} }\n')
    writeFileSync(join(vault, 'a.md'), 'hi')
    await expect(compileVault({ vaultDir: vault, outDir: tmp() })).rejects.toThrow(ConfigError)
    await expect(compileVault({ vaultDir: vault, outDir: tmp() })).rejects.toThrow('workspaces[0].tabs[0].view: "galery"')
  })

  test('a config that is not YAML fails clearly', async () => {
    const vault = tmp()
    writeFileSync(join(vault, 'soii.config.yml'), 'title: [oops')
    await expect(compileVault({ vaultDir: vault, outDir: tmp() })).rejects.toThrow('soii.config.yml: not valid YAML')
  })

  test('an empty vault compiles to an empty index with defaults', async () => {
    const r = await compileVault({ vaultDir: tmp(), outDir: tmp() })
    expect(r.index.notes).toEqual([])
    expect(r.index.config.title).toBe('soii')
  })

  test('person notes get lastSeen from dated list items and last_contact; other notes do not', async () => {
    const vault = tmp()
    writeFileSync(join(vault, 'Ann.md'), '---\ntype: person\nlast_contact: 2026-01-05\n---\n## Notes\n- 2026-03-02: coffee\n- 2099-01-01: planned\n%%\n- 2026-09-09: private\n%%\n')
    writeFileSync(join(vault, 'Bo.md'), '---\ntype: contact\n---\nNo dates.')
    writeFileSync(join(vault, 'Log.md'), '- 2026-03-02: not a person')
    const r = await compileVault({ vaultDir: vault, outDir: tmp() })
    const byId = Object.fromEntries(r.index.notes.map(n => [n.id, n]))
    expect(byId.Ann.lastSeen).toBe('2026-03-02')
    expect(byId.Bo.lastSeen).toBeNull()
    expect(byId.Log.lastSeen).toBeUndefined()
  })

  test('obsidianVault: soii.config.yml, else the given vault name, else the folder name', async () => {
    const vault = join(tmp(), 'my vault')
    mkdirSync(vault)
    writeFileSync(join(vault, 'a.md'), 'hi')
    expect((await compileVault({ vaultDir: vault, outDir: tmp() })).index.config.obsidianVault).toBe('my vault')
    expect((await compileVault({ vaultDir: vault, outDir: tmp(), vaultName: 'cos' })).index.config.obsidianVault).toBe('cos')
    writeFileSync(join(vault, 'soii.config.yml'), 'obsidianVault: Second Brain\n')
    expect((await compileVault({ vaultDir: vault, outDir: tmp(), vaultName: 'cos' })).index.config.obsidianVault).toBe('Second Brain')
  })

  test('unquoted [[cover]] (nested YAML list) still resolves the image', async () => {
    const vault = tmp()
    writeFileSync(join(vault, 'b.md'), '---\ntype: book\ncover: [[c.svg]]\n---\n')
    writeFileSync(join(vault, 'c.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const r = await compileVault({ vaultDir: vault, outDir: tmp() })
    expect(r.index.notes[0].image).toBe('/api/files/c.svg')
  })
})

describe('compileVault privacy', () => {
  test('a hidden note with invalid YAML is still hidden, with its attachments', async () => {
    const vault = tmp()
    const outDir = tmp()
    writeFileSync(join(vault, 'Broken hidden.md'), '---\nsoii: hidden\ntitle: [unclosed\n---\nTOPSECRET ![[priv.svg]]\n')
    writeFileSync(join(vault, 'priv.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    writeFileSync(join(vault, 'Public.md'), 'Visible note.')
    const r = await compileVault({ vaultDir: vault, outDir })
    expect(r.index.notes.map(n => n.id)).toEqual(['Public'])
    expect(existsSync(join(outDir, 'files', 'priv.svg'))).toBe(false)
    expect(readFileSync(join(outDir, 'search.json'), 'utf8')).not.toContain('TOPSECRET')
    expect(r.warnings.some(w => w.startsWith('Broken hidden.md:'))).toBe(true)
  })

  test('private comments never reach excerpts, search or HTML', async () => {
    const vault = tmp()
    const outDir = tmp()
    writeFileSync(join(vault, 'c.md'), 'Open <!-- COMMENTSECRET --> text %%PERCENTSECRET%% end.\n\n%%\nMULTISECRET\n%%\n\nTail.')
    const r = await compileVault({ vaultDir: vault, outDir })
    expect(r.index.notes[0].excerpt).toBe('Open text end. Tail.')
    const everything = [
      readFileSync(join(outDir, 'index.json'), 'utf8'),
      readFileSync(join(outDir, 'search.json'), 'utf8'),
      readFileSync(join(outDir, 'notes', noteFileName('c')), 'utf8')
    ].join('\n')
    for (const secret of ['COMMENTSECRET', 'PERCENTSECRET', 'MULTISECRET']) expect(everything).not.toContain(secret)
  })
})

describe('compileVault duplicate ids', () => {
  // Needs a filesystem that can hold Dup.md and Dup.MD side by side (Linux, so Vercel);
  // on macOS's default case-insensitive volume this returns early and walk.test.ts covers the logic.
  test('one note per id, no overwritten files, and a warning', async () => {
    const vault = tmp()
    writeFileSync(join(vault, 'Dup.md'), 'lower')
    writeFileSync(join(vault, 'Dup.MD'), 'upper')
    if (readdirSync(vault).length < 2) return
    const outDir = tmp()
    const r = await compileVault({ vaultDir: vault, outDir })
    expect(r.index.notes.map(n => n.id)).toEqual(['Dup'])
    expect(r.warnings).toEqual(['Dup.md: skipped, Dup.MD already has the note id "Dup"'])
    expect(readdirSync(join(outDir, 'notes'))).toHaveLength(1)
  })
})
