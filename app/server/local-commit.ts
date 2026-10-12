// app/server/local-commit.ts
// In local mode every write soii makes is a local git commit of exactly the file it wrote (D76), so Sync has something to push
// and the vault stays clean.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { SoiiEnv } from './env'
import type { RunGit } from './sync'

/** Commit just this file in VAULT_PATH. Not pushed: an unpushed commit is safer than a failed push. */
export async function commitLocal(env: SoiiEnv, git: RunGit, path: string, message: string): Promise<string> {
  const base = resolve(env.vaultPath ?? '')
  if (!existsSync(join(base, '.git'))) return 'Saved. The vault folder is not a git repository, so nothing was committed.'
  const add = await git(base, ['add', '--', path])
  const commit = add.code === 0 ? await git(base, ['commit', '-m', message, '--only', '--', path]) : add
  if (commit.code !== 0) return `Saved, but git didn't commit it: ${(commit.out.split('\n').find(Boolean) ?? 'unknown error').slice(0, 200)}`
  return 'Committed in your local vault (not pushed).'
}
