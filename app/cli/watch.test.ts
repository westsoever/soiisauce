import { expect, test } from 'bun:test'
import { isIgnoredVaultPath } from './watch'

test('notes and attachments are watched', () => {
  for (const p of ['Home.md', '05-Knowledge/People/Anna.md', 'Attachments/covers/x.svg', 'soii.config.yml']) expect(isIgnoredVaultPath(p)).toBe(false)
})

test('dot-folders are never watched (.git, .obsidian, and soii itself in .soii, whose build output would loop), apart from the skill files below', () => {
  for (const p of ['.git/index', '.git/refs/heads/main', '.obsidian/workspace.json', '.soii/build/dist/index.html', '.soii/node_modules/soii/package.json', '.DS_Store']) {
    expect(isIgnoredVaultPath(p)).toBe(true)
  }
})

test('skill files are the exception: a change to a SKILL.md rebuilds the Skills page', () => {
  for (const p of ['.claude/skills/soii-health/SKILL.md', '.claude/skills/my-own/SKILL.md', '.soii/skills.json']) expect(isIgnoredVaultPath(p)).toBe(false)
})

test('a new skill folder arrives as a directory event first, so the skills tree itself counts', () => {
  for (const p of ['.claude', '.claude/skills', '.claude/skills/my-new-skill']) expect(isIgnoredVaultPath(p)).toBe(false)
})

test('but the rest of .claude and .soii stays ignored', () => {
  for (const p of ['.claude/settings.json', '.claude/skills/soii-health/notes.md', '.claude/skills/soii-health/extra/SKILL.md', '.claude/commands/x.md', '.soii/package.json', '.soii/build/api/_generated/vault/index.json']) {
    expect(isIgnoredVaultPath(p)).toBe(true)
  }
})

test('the TeX compile cache is ignored, `.soii/skills.json` is not', () => {
  expect(isIgnoredVaultPath('.soii/cache/tex/abc/out.pdf')).toBe(true)
  expect(isIgnoredVaultPath('.soii/cache/tex/abc')).toBe(true)
  expect(isIgnoredVaultPath('.soii/skills.json')).toBe(false)
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
