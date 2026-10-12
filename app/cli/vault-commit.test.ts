// Committing what `soii install` / `soii update` wrote into the vault, and nothing else, with real git.
import { afterEach, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitSoiiFiles } from './vault-commit'
import { realCtx } from './context'

const dirs: string[] = []
const ctx = realCtx()
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim()
function repo(): string {
  const d = mkdtempSync(join(tmpdir(), 'soii-vc-'))
  dirs.push(d)
  git(d, 'init', '-q', '-b', 'main')
  writeFileSync(join(d, 'note.md'), 'one')
  git(d, 'add', '-A')
  git(d, 'commit', '-q', '-m', 'first')
  return d
}
const put = (root: string, rel: string, text = 'x') => {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), text)
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
// The commit runs with the author git already has; give the test repo one.
const withIdentity = { ...ctx, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }
const run = (vault: string, skills: string[], removed: string[] = [], message = 'soii: install v0.1.1') =>
  commitSoiiFiles(withIdentity, vault, { skills, removed, message })

test('commits the pin, the gitignore, the manifest and the skills it installed, and nothing else', async () => {
  const v = repo()
  put(v, '.soii/package.json', '{}')
  put(v, '.soii/.gitignore', 'soii/\n')
  put(v, '.soii/skills.json', '{}')
  put(v, '.claude/skills/soii-health/SKILL.md')
  put(v, '.claude/skills/my-own/SKILL.md')
  put(v, 'note.md', 'edited and not committed')
  put(v, 'new-note.md')
  const r = await run(v, ['soii-health'])
  expect(r).toEqual({ committed: true })
  expect(git(v, 'log', '-1', '--format=%s')).toBe('soii: install v0.1.1')
  const files = git(v, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()
  expect(files).toEqual(['.claude/skills/soii-health/SKILL.md', '.soii/.gitignore', '.soii/package.json', '.soii/skills.json'])
  const left = git(v, 'status', '--porcelain').split('\n').map(l => l.trim()).sort()
  expect(left).toEqual(['?? .claude/skills/my-own/', '?? new-note.md', 'M note.md'])
})

test('a file the owner already staged is not swept into the commit', async () => {
  const v = repo()
  put(v, 'staged.md')
  git(v, 'add', 'staged.md')
  put(v, '.soii/package.json', '{}')
  await run(v, [])
  expect(git(v, 'show', '--name-only', '--format=', 'HEAD')).toBe('.soii/package.json')
  expect(git(v, 'status', '--porcelain')).toBe('A  staged.md')
})

test('a skill folder that was removed upstream is committed as removed', async () => {
  const v = repo()
  put(v, '.claude/skills/vault-health/SKILL.md')
  git(v, 'add', '-A')
  git(v, 'commit', '-q', '-m', 'old skill')
  rmSync(join(v, '.claude/skills/vault-health'), { recursive: true })
  put(v, '.soii/skills.json', '{}')
  await run(v, [], ['vault-health'], 'soii: update to v0.1.1')
  expect(git(v, 'log', '-1', '--format=%s')).toBe('soii: update to v0.1.1')
  expect(git(v, 'show', '--name-status', '--format=', 'HEAD').split('\n').sort()).toEqual(['A\t.soii/skills.json', 'D\t.claude/skills/vault-health/SKILL.md'])
})

test('nothing to commit means no commit and no error', async () => {
  const v = repo()
  put(v, '.soii/package.json', '{}')
  await run(v, [])
  const before = git(v, 'rev-parse', 'HEAD')
  expect(await run(v, [])).toEqual({ committed: false })
  expect(git(v, 'rev-parse', 'HEAD')).toBe(before)
})

test('a vault that is not a git repo is skipped', async () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-vc-'))
  dirs.push(d)
  put(d, '.soii/package.json', '{}')
  expect(await run(d, [])).toEqual({ committed: false, reason: 'not a git repository' })
})

test('a failing commit is reported, not thrown', async () => {
  const v = repo()
  put(v, '.soii/package.json', '{}')
  put(v, '.git/hooks/pre-commit', '#!/bin/sh\nexit 1\n')
  execFileSync('chmod', ['+x', join(v, '.git/hooks/pre-commit')])
  const r = await run(v, [])
  expect(r.committed).toBe(false)
  expect('reason' in r && r.reason).toMatch(/commit/)
})
