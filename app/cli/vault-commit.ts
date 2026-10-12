// app/cli/vault-commit.ts
// After install/update, the files soii wrote into the vault are committed so the vault starts clean
// (soii-health and soii-setup stop on a dirty tree). Exactly those files, never anything else the owner has.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Ctx } from './context'

export async function commitSoiiFiles(
  ctx: Ctx,
  vault: string,
  o: { skills: string[]; removed: string[]; message: string }
): Promise<{ committed: true } | { committed: false; reason?: string }> {
  if (!existsSync(join(vault, '.git'))) return { committed: false, reason: 'not a git repository' }
  const git = (args: string[]) => ctx.exec('git', args, { cwd: vault })
  const wanted = ['.soii/package.json', '.soii/.gitignore', '.soii/skills.json', ...[...o.skills, ...o.removed].map(n => `.claude/skills/${n}`)]
  // A pathspec that matches nothing makes git add fail: keep the ones on disk or already tracked (a removed skill).
  const paths: string[] = []
  for (const p of wanted) {
    if (existsSync(join(vault, p)) || (await git(['ls-files', '--', p])).out) paths.push(p)
  }
  if (paths.length === 0) return { committed: false }
  const add = await git(['add', '-A', '--', ...paths])
  if (add.code !== 0) return { committed: false, reason: `git add failed: ${add.out.split('\n')[0]}` }
  if (!(await git(['status', '--porcelain', '--', ...paths])).out) return { committed: false }
  // --only: whatever else the owner has staged stays staged and out of this commit.
  const commit = await git(['commit', '-q', '-m', o.message, '--only', '--', ...paths])
  if (commit.code !== 0) return { committed: false, reason: `git commit failed: ${commit.out.split('\n')[0]}` }
  return { committed: true }
}
