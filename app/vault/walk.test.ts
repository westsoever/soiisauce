// app/vault/walk.test.ts
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { collectWalk, walkVault } from './walk'

const temps: string[] = []
afterAll(() => temps.forEach(d => rmSync(d, { recursive: true, force: true })))

function vault(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'soii-walk-'))
  temps.push(dir)
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    writeFileSync(join(dir, f), 'x')
  }
  return dir
}

describe('walkVault exclude', () => {
  const files = ['Private/s.md', 'Private/deep/t.md', 'Privately/u.md', 'Notes/Private/v.md', 'Notes/n.md', 'Public/p.md']

  test('a bare folder name excludes that folder and everything under it', () => {
    expect(walkVault(vault(files), ['Private']).markdown).toEqual(['Notes/Private/v.md', 'Notes/n.md', 'Privately/u.md', 'Public/p.md'])
  })

  test('Private/ and Private/** exclude it the same way', () => {
    const dir = vault(files)
    const expected = ['Notes/Private/v.md', 'Notes/n.md', 'Privately/u.md', 'Public/p.md']
    expect(walkVault(dir, ['Private/']).markdown).toEqual(expected)
    expect(walkVault(dir, ['Private/**']).markdown).toEqual(expected)
  })

  test('**/Private excludes the folder at any depth', () => {
    expect(walkVault(vault(files), ['**/Private']).markdown).toEqual(['Notes/n.md', 'Privately/u.md', 'Public/p.md'])
  })

  test('a wildcard in the last segment matches files only: Priv* keeps every folder', () => {
    expect(walkVault(vault(files), ['Priv*']).markdown).toEqual([
      'Notes/Private/v.md',
      'Notes/n.md',
      'Private/deep/t.md',
      'Private/s.md',
      'Privately/u.md',
      'Public/p.md'
    ])
  })

  test('Priv*/** is how to drop folders by a wildcard', () => {
    expect(walkVault(vault(files), ['Priv*/**']).markdown).toEqual(['Notes/Private/v.md', 'Notes/n.md', 'Public/p.md'])
  })

  test('* excludes root files only, not nested folders', () => {
    expect(walkVault(vault(['a.md', 'Sub/b.md', 'Sub/deep/c.md']), ['*']).markdown).toEqual(['Sub/b.md', 'Sub/deep/c.md'])
  })

  test('*.md excludes files only, even in a folder called Notes.md', () => {
    expect(walkVault(vault(['r.md', 'Notes.md/x.md', 'Sub/y.md']), ['*.md']).markdown).toEqual(['Notes.md/x.md', 'Sub/y.md'])
  })

  test('**/_* excludes the files that start with _ and keeps _attachments/ and _drafts/', () => {
    const dir = vault(['_attachments/_x.png', '_attachments/y.png', '_drafts/_d.md', '_drafts/e.md', 'f.md', '_root.md'])
    const r = walkVault(dir, ['**/_*'])
    expect(r.attachments).toEqual(['_attachments/y.png'])
    expect(r.markdown).toEqual(['_drafts/e.md', 'f.md'])
  })

  test('braces without wildcards still name folders: **/{Private,Drafts}', () => {
    const dir = vault(['Private/a.md', 'x/Drafts/b.md', 'Public/c.md'])
    expect(walkVault(dir, ['**/{Private,Drafts}']).markdown).toEqual(['Public/c.md'])
  })

  test('attachments in an excluded folder are excluded too', () => {
    expect(walkVault(vault(['Private/a.png', 'b.png']), ['Private']).attachments).toEqual(['b.png'])
  })
})

describe('collectWalk duplicates', () => {
  const f = (path: string, onDisk = path) => ({ path, onDisk })

  test('ids that collide ignoring the .md case: the first sorted path wins, with a warning', () => {
    const r = collectWalk([f('Dup.md'), f('Dup.MD'), f('Other.md')])
    expect(r.markdown).toEqual(['Dup.MD', 'Other.md'])
    expect(r.warnings).toEqual(['Dup.md: skipped, Dup.MD already has the note id "Dup"'])
    expect([...r.fsPaths.keys()].sort()).toEqual(['Dup.MD', 'Other.md'])
  })

  test('NFC and NFD spellings of one name keep exactly one file, whatever the read order', () => {
    const nfc = 'Caf\u00e9.md'
    const nfd = 'Cafe\u0301.md'
    const a = collectWalk([f(nfc, nfc), f(nfc, nfd)])
    const b = collectWalk([f(nfc, nfd), f(nfc, nfc)])
    for (const r of [a, b]) {
      expect(r.markdown).toEqual([nfc])
      expect(r.warnings).toHaveLength(1)
    }
    expect(a.fsPaths.get(nfc)).toBe(b.fsPaths.get(nfc))
  })

  test('attachments that collide after normalisation keep one, with a warning', () => {
    const r = collectWalk([f('a/c.png', 'a/c.png'), f('a/c.png', 'a/c\u0301.png')])
    expect(r.attachments).toEqual(['a/c.png'])
    expect(r.warnings).toHaveLength(1)
  })

  test('names that differ only by case are different ids and both stay', () => {
    const r = collectWalk([f('Dup.md'), f('dup.md')])
    expect(r.markdown).toEqual(['Dup.md', 'dup.md'])
    expect(r.warnings).toEqual([])
  })

  test('files that are neither notes nor attachments are ignored', () => {
    expect(collectWalk([f('a.txt'), f('b.md')]).markdown).toEqual(['b.md'])
  })
})
