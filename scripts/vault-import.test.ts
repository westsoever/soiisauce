import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { importVault } from './vault-import'

const dirs: string[] = []
function makeDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'soii-import-'))
  dirs.push(dir)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('importVault', () => {
  const source = {
    '00-Inbox/Idea.md': '# Idea\n',
    'Books/Dune.md': '---\ntype: book\n---\n',
    'Books/cover.jpg': 'jpg',
    'Attachments/scan.pdf': 'pdf',
    'soii.config.yml': 'title: mine\n',
    '.obsidian/app.json': '{}',
    '.git/HEAD': 'ref: refs/heads/main',
    '.github/workflows/soii-deploy.yml': 'name: x',
    '.claude/skills/other/SKILL.md': 'x',
    '.soii/package.json': '{}',
    '.trash/old.md': 'old',
    'node_modules/x/index.md': 'x',
    '.DS_Store': 'x'
  }

  test('copies notes, attachments and the owner config; leaves vault plumbing behind', () => {
    const src = makeDir(source)
    const dest = makeDir()
    const report = importVault(src, dest)
    expect(report.copied.sort()).toEqual(['00-Inbox/Idea.md', 'Attachments/scan.pdf', 'Books/Dune.md', 'Books/cover.jpg', 'soii.config.yml'])
    expect(report.conflicts).toEqual([])
    expect(readFileSync(join(dest, 'Books/Dune.md'), 'utf8')).toBe('---\ntype: book\n---\n')
    for (const left of ['.obsidian', '.git', '.github', '.claude', '.soii', '.trash', 'node_modules', '.DS_Store']) expect(existsSync(join(dest, left))).toBe(false)
  })

  test('never overwrites: an existing file is reported as a conflict and kept', () => {
    const src = makeDir(source)
    const dest = makeDir({ 'soii.config.yml': 'title: template\n', 'Books/Dune.md': 'mine' })
    const report = importVault(src, dest)
    expect(report.conflicts.sort()).toEqual(['Books/Dune.md', 'soii.config.yml'])
    expect(readFileSync(join(dest, 'soii.config.yml'), 'utf8')).toBe('title: template\n')
    expect(readFileSync(join(dest, 'Books/Dune.md'), 'utf8')).toBe('mine')
    expect(report.copied).toContain('00-Inbox/Idea.md')
  })

  test('a dry run reports the same and writes nothing', () => {
    const src = makeDir(source)
    const dest = makeDir()
    const report = importVault(src, dest, { dryRun: true })
    expect(report.copied).toHaveLength(5)
    expect(existsSync(join(dest, 'Books'))).toBe(false)
  })

  test('keeps modification times, never touches the source, skips symlinks', () => {
    const src = makeDir({ 'A.md': 'a' })
    const old = new Date('2024-05-06T07:08:09Z')
    utimesSync(join(src, 'A.md'), old, old)
    symlinkSync('/etc/hosts', join(src, 'link.md'))
    const dest = makeDir()
    const report = importVault(src, dest)
    expect(statSync(join(dest, 'A.md')).mtime.getTime()).toBe(old.getTime())
    expect(report.copied).toEqual(['A.md'])
    expect(readFileSync(join(src, 'A.md'), 'utf8')).toBe('a')
  })

  test('refuses the same folder, a destination inside the source and a missing source', () => {
    const src = makeDir({ 'A.md': 'a' })
    expect(() => importVault(src, src)).toThrow(/same folder/)
    mkdirSync(join(src, 'inner'))
    expect(() => importVault(src, join(src, 'inner'))).toThrow(/inside/)
    expect(() => importVault(join(src, 'nope'), makeDir())).toThrow(/Not a folder/)
  })
})
