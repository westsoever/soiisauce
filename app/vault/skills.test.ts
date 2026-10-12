import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSkills } from './skills'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-skills-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const skill = (root: string, folder: string, name = folder, description = `${name} does a thing. Use when asked.`, body = 'SECRET BODY') => {
  mkdirSync(join(root, '.claude', 'skills', folder), { recursive: true })
  writeFileSync(join(root, '.claude', 'skills', folder, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`)
}
/** soii's own skills folder in a (fake) soii checkout. */
const skillsDir = (root: string) => join(root, '.claude', 'skills')
const manifest = (vault: string, skills: string[]) => {
  mkdirSync(join(vault, '.soii'), { recursive: true })
  writeFileSync(join(vault, '.soii', 'skills.json'), JSON.stringify({ skills }))
}

test('reads name and description of every skill in the vault, sorted, and never the body', () => {
  const v = tmp()
  skill(v, 'soii-health')
  skill(v, 'my-own')
  const skills = readSkills(v)
  expect(skills.map(s => s.id)).toEqual(['my-own', 'soii-health'])
  expect(skills[0]).toEqual({ id: 'my-own', name: 'my-own', description: 'my-own does a thing. Use when asked.', soii: false })
  expect(JSON.stringify(skills)).not.toContain('SECRET BODY')
})

test('the manifest decides which are soii\'s: listed ones are, the rest are the owner\'s', () => {
  const v = tmp()
  skill(v, 'soii-health')
  skill(v, 'soii-capture')
  skill(v, 'made-with-skillfactory')
  manifest(v, ['soii-health', 'soii-capture'])
  expect(readSkills(v).map(s => [s.id, s.soii])).toEqual([
    ['made-with-skillfactory', false],
    ['soii-capture', true],
    ['soii-health', true]
  ])
})

test('without a manifest, a skill soii itself ships counts as soii\'s', () => {
  const v = tmp()
  const repo = tmp()
  skill(v, 'soii-health')
  skill(v, 'mine')
  skill(repo, 'soii-health')
  expect(readSkills(v, skillsDir(repo)).map(s => [s.id, s.soii])).toEqual([
    ['mine', false],
    ['soii-health', true]
  ])
})

test('a vault with no .claude/skills falls back to the skills soii ships, all marked as soii\'s', () => {
  const v = tmp()
  const repo = tmp()
  skill(repo, 'soii-health')
  skill(repo, 'soii-chat')
  expect(readSkills(v, skillsDir(repo)).map(s => [s.id, s.soii])).toEqual([
    ['soii-chat', true],
    ['soii-health', true]
  ])
})

test('an empty .claude/skills is a vault with no skills, not a reason to fall back', () => {
  const v = tmp()
  mkdirSync(join(v, '.claude', 'skills'), { recursive: true })
  const repo = tmp()
  skill(repo, 'soii-health')
  expect(readSkills(v, skillsDir(repo))).toEqual([])
})

test('no skills anywhere is an empty list', () => {
  expect(readSkills(tmp())).toEqual([])
  expect(readSkills(tmp(), join(tmp(), 'nope'))).toEqual([])
})

test('folders without a SKILL.md, and stray files, are skipped', () => {
  const v = tmp()
  skill(v, 'good')
  mkdirSync(join(v, '.claude', 'skills', 'empty-folder'), { recursive: true })
  writeFileSync(join(v, '.claude', 'skills', 'README.md'), 'hi')
  expect(readSkills(v).map(s => s.id)).toEqual(['good'])
})

test('a corrupt manifest is ignored (falls back to what soii ships)', () => {
  const v = tmp()
  const repo = tmp()
  skill(v, 'soii-health')
  skill(repo, 'soii-health')
  mkdirSync(join(v, '.soii'), { recursive: true })
  writeFileSync(join(v, '.soii', 'skills.json'), '{nope')
  expect(readSkills(v, skillsDir(repo)).map(s => s.soii)).toEqual([true])
})

test('a symlinked skill folder is read like any other', () => {
  const v = tmp()
  const elsewhere = tmp()
  skill(elsewhere, 'linked')
  mkdirSync(join(v, '.claude', 'skills'), { recursive: true })
  require('node:fs').symlinkSync(join(elsewhere, '.claude', 'skills', 'linked'), join(v, '.claude', 'skills', 'linked'))
  expect(readSkills(v).map(s => s.id)).toEqual(['linked'])
})
