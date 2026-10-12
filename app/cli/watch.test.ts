import { expect, test } from 'bun:test'
import { isIgnoredVaultPath } from './watch'

test('notes and attachments are watched', () => {
  for (const p of ['Home.md', '05-Knowledge/People/Anna.md', 'Attachments/covers/x.svg', 'soii.config.yml']) expect(isIgnoredVaultPath(p)).toBe(false)
})

test('dot-folders are never watched: .git, .obsidian, .claude, and soii itself in .soii (whose build output would loop)', () => {
  for (const p of ['.git/index', '.git/refs/heads/main', '.obsidian/workspace.json', '.claude/skills/x/SKILL.md', '.soii/build/dist/index.html', '.soii/node_modules/soii/package.json', '.DS_Store']) {
    expect(isIgnoredVaultPath(p)).toBe(true)
  }
})

test('a dot-folder deeper in the tree is ignored too, and so is node_modules', () => {
  expect(isIgnoredVaultPath('02-Projects/.trash/old.md')).toBe(true)
  expect(isIgnoredVaultPath('tools/node_modules/x/index.js')).toBe(true)
})

test('a file whose name merely contains a dot is a note', () => {
  expect(isIgnoredVaultPath('04-Resources/v1.2 notes.md')).toBe(false)
})

test('no file name (the watcher sometimes sends null) is ignored', () => {
  expect(isIgnoredVaultPath(null)).toBe(true)
  expect(isIgnoredVaultPath('')).toBe(true)
})
