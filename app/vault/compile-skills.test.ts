// The compiled index carries the vault's skills for the Skills page.
import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileVault } from './compile'

const temps: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-compile-skills-'))
  temps.push(d)
  return d
}
afterAll(() => temps.forEach(d => rmSync(d, { recursive: true, force: true })))

function vaultWithSkill(): string {
  const v = tmp()
  writeFileSync(join(v, 'Note.md'), '---\ntype: note\n---\nHello\n')
  mkdirSync(join(v, '.claude', 'skills', 'my-skill'), { recursive: true })
  writeFileSync(join(v, '.claude', 'skills', 'my-skill', 'SKILL.md'), '---\nname: my-skill\ndescription: Mine. Use when I say so.\n---\nBody text\n')
  return v
}

test('index.skills lists the vault\'s skills, and the notes are unaffected', async () => {
  const out = tmp()
  const { index } = await compileVault({ vaultDir: vaultWithSkill(), outDir: out })
  expect(index.skills).toEqual([{ id: 'my-skill', name: 'my-skill', description: 'Mine. Use when I say so.', soii: false }])
  expect(index.notes.map(n => n.id)).toEqual(['Note'])
  expect(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')).skills).toHaveLength(1)
})

test('a skill folder never becomes a note, and its body is not in the output', async () => {
  const out = tmp()
  await compileVault({ vaultDir: vaultWithSkill(), outDir: out })
  expect(readFileSync(join(out, 'index.json'), 'utf8')).not.toContain('Body text')
})

test('a vault without skills uses the shipped ones when given, and has none otherwise', async () => {
  const v = tmp()
  writeFileSync(join(v, 'Note.md'), 'x\n')
  const shipped = tmp()
  mkdirSync(join(shipped, 'soii-health'), { recursive: true })
  writeFileSync(join(shipped, 'soii-health', 'SKILL.md'), '---\nname: soii-health\ndescription: Check-up.\n---\n')
  expect((await compileVault({ vaultDir: v, outDir: tmp(), shippedSkillsDir: shipped })).index.skills).toEqual([{ id: 'soii-health', name: 'soii-health', description: 'Check-up.', soii: true }])
  expect((await compileVault({ vaultDir: v, outDir: tmp() })).index.skills).toEqual([])
})
