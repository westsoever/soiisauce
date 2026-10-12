import { afterEach, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyTemplate, NOT_FOR_VAULTS, syncSkills } from './copy'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-copy-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const put = (root: string, rel: string, text = 'x') => {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), text)
}
const tree = (root: string, rel = ''): string[] =>
  readdirSync(join(root, rel), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? tree(root, `${rel}${e.name}/`) : [`${rel}${e.name}`])).sort()

function fakeTemplate(): string {
  const t = tmp()
  put(t, 'Home.md')
  put(t, 'README.md')
  put(t, 'soii.config.yml', "title: Sam's vault\nhome: today\n")
  put(t, '.gitignore', '.trash/\n')
  put(t, '.soii/package.json', '{}')
  put(t, '.soii/.gitignore', 'node_modules/\n')
  put(t, '.obsidian/app.json', '{}')
  put(t, 'Templates/Book.md')
  put(t, '00-Inbox/Idea.md')
  put(t, '05-Knowledge/People/Ida.md')
  put(t, 'Attachments/covers/a.svg')
  return t
}

test('copyTemplate copies everything, dotfiles included', () => {
  const dest = join(tmp(), 'vault')
  copyTemplate(fakeTemplate(), dest, { empty: false, title: 'vault' })
  expect(tree(dest)).toEqual([
    '.gitignore', '.obsidian/app.json', '.soii/.gitignore', '.soii/package.json', '00-Inbox/Idea.md', '05-Knowledge/People/Ida.md',
    'Attachments/covers/a.svg', 'Home.md', 'README.md', 'Templates/Book.md', 'soii.config.yml'
  ])
  // The title is the new vault's, never Sam's, whether or not the sample notes come along.
  expect(readFileSync(join(dest, 'soii.config.yml'), 'utf8')).toBe('title: vault\nhome: today\n')
})

test('copyTemplate quotes a title YAML would misread', () => {
  const read = (title: string) => {
    const dest = join(tmp(), 'v')
    copyTemplate(fakeTemplate(), dest, { empty: false, title })
    return readFileSync(join(dest, 'soii.config.yml'), 'utf8').split('\n')[0]
  }
  expect(read("Ana's notes")).toBe('title: Ana\'s notes')
  expect(read('Work: 2026')).toBe('title: "Work: 2026"')
  expect(read('# mine')).toBe('title: "# mine"')
  expect(read('- list')).toBe('title: "- list"')
  expect(read(' padded ')).toBe('title: " padded "')
})

test('copyTemplate --empty keeps the machinery and drops Sam, leaving the folders ready', () => {
  const dest = join(tmp(), 'vault')
  copyTemplate(fakeTemplate(), dest, { empty: true, title: 'My vault' })
  expect(tree(dest)).toEqual([
    '.gitignore', '.obsidian/app.json', '.soii/.gitignore', '.soii/package.json', '00-Inbox/.gitkeep', '05-Knowledge/People/.gitkeep',
    'Templates/Book.md', 'soii.config.yml'
  ])
  expect(readFileSync(join(dest, 'soii.config.yml'), 'utf8')).toBe('title: My vault\nhome: today\n')
})

test('copyTemplate refuses a non-empty destination', () => {
  const dest = tmp()
  put(dest, 'mine.md')
  expect(() => copyTemplate(fakeTemplate(), dest, { empty: false, title: 'x' })).toThrow(/not empty/)
})

test('copyTemplate may fill an existing empty folder', () => {
  const dest = tmp()
  copyTemplate(fakeTemplate(), dest, { empty: true, title: 'x' })
  expect(existsSync(join(dest, 'soii.config.yml'))).toBe(true)
})

test('syncSkills installs every upstream skill, skips excluded ones, and writes a manifest', () => {
  const src = tmp()
  put(src, 'soii-health/SKILL.md')
  put(src, 'soii-install/SKILL.md')
  put(src, 'soii-setup/SKILL.md')
  const dest = join(tmp(), 'skills')
  const manifest = join(tmp(), 'skills.json')
  const r = syncSkills(src, dest, manifest, ['soii-install'])
  expect(r).toEqual({ installed: ['soii-health', 'soii-setup'], removed: [] })
  expect(existsSync(join(dest, 'soii-install'))).toBe(false)
  expect(JSON.parse(readFileSync(manifest, 'utf8'))).toEqual({ skills: ['soii-health', 'soii-setup'] })
})

test('syncSkills removes what it installed before and upstream no longer has (a rename), and nothing else', () => {
  const dest = tmp()
  const manifest = join(tmp(), 'skills.json')
  const v1 = tmp()
  put(v1, 'vault-health/SKILL.md')
  syncSkills(v1, dest, manifest)
  put(dest, 'my-own-skill/SKILL.md', 'mine')
  const v2 = tmp()
  put(v2, 'soii-health/SKILL.md')
  const r = syncSkills(v2, dest, manifest)
  expect(r).toEqual({ installed: ['soii-health'], removed: ['vault-health'] })
  expect(existsSync(join(dest, 'vault-health'))).toBe(false)
  expect(existsSync(join(dest, 'soii-health/SKILL.md'))).toBe(true)
  expect(readFileSync(join(dest, 'my-own-skill/SKILL.md'), 'utf8')).toBe('mine')
})

test('syncSkills never removes a folder that is not in the manifest, even if it has an old soii name', () => {
  const dest = tmp()
  put(dest, 'vault-health/SKILL.md', 'hand-made, never installed by soii')
  const src = tmp()
  put(src, 'soii-health/SKILL.md')
  const r = syncSkills(src, dest, join(tmp(), 'skills.json'))
  expect(r.removed).toEqual([])
  expect(existsSync(join(dest, 'vault-health/SKILL.md'))).toBe(true)
})

test('syncSkills survives a corrupt manifest by treating it as empty', () => {
  const dest = tmp()
  const manifest = join(tmp(), 'skills.json')
  writeFileSync(manifest, '{nope')
  const src = tmp()
  put(src, 'a/SKILL.md')
  expect(syncSkills(src, dest, manifest).installed).toEqual(['a'])
  expect(JSON.parse(readFileSync(manifest, 'utf8'))).toEqual({ skills: ['a'] })
})

test('a skill that was excluded and is in the old manifest is cleaned up', () => {
  const dest = tmp()
  const manifest = join(tmp(), 'skills.json')
  const src = tmp()
  put(src, 'soii-install/SKILL.md')
  put(src, 'a/SKILL.md')
  syncSkills(src, dest, manifest)
  expect(existsSync(join(dest, 'soii-install'))).toBe(true)
  const r = syncSkills(src, dest, manifest, ['soii-install'])
  expect(r.removed).toEqual(['soii-install'])
  expect(existsSync(join(dest, 'soii-install'))).toBe(false)
})

test('maintainer skills are never installed into a vault: soii-install and soii-release', () => {
  expect(NOT_FOR_VAULTS).toEqual(['soii-install', 'soii-release'])
  const src = tmp()
  put(src, 'soii-install/SKILL.md')
  put(src, 'soii-release/SKILL.md')
  put(src, 'soii-health/SKILL.md')
  const dest = join(tmp(), 'skills')
  const r = syncSkills(src, dest, join(tmp(), 'skills.json'), NOT_FOR_VAULTS)
  expect(r.installed).toEqual(['soii-health'])
  expect(existsSync(join(dest, 'soii-release'))).toBe(false)
})

test('a skill soii stops shipping (soii-update, D105) is removed from a vault that has it from an earlier install, and nothing else is', () => {
  const dest = tmp()
  const manifest = join(tmp(), 'skills.json')
  const before = tmp()
  put(before, 'soii-update/SKILL.md')
  put(before, 'soii-health/SKILL.md')
  syncSkills(before, dest, manifest, NOT_FOR_VAULTS)
  put(dest, 'my-own/SKILL.md', 'mine')
  const after = tmp()
  put(after, 'soii-health/SKILL.md')
  const r = syncSkills(after, dest, manifest, NOT_FOR_VAULTS)
  expect(r).toEqual({ installed: ['soii-health'], removed: ['soii-update'] })
  expect(existsSync(join(dest, 'soii-update'))).toBe(false)
  expect(existsSync(join(dest, 'my-own/SKILL.md'))).toBe(true)
})
