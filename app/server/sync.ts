// app/server/sync.ts
// The sidebar's Sync button: `git pull --ff-only` in the local vault (VAULT_PATH). The server
// already watches that folder, so pulled files trigger the rebuild.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SoiiEnv } from './env'

export type SyncResult =
  | { ok: true; changed: boolean; summary: string; pushed?: boolean }
  | { ok: false; status: 409 | 500 | 501; error: string; message: string }

export type RunGit = (cwd: string, args: string[]) => Promise<{ code: number; out: string }>

export const runGit: RunGit = (cwd, args) =>
  new Promise(resolve => {
    // No shell, fixed arguments, and no prompt if GitHub wants credentials (it must fail, not hang).
    execFile('git', args, { cwd, timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0
      resolve({ code, out: `${stdout}${stderr}`.trim() })
    })
  })

export function canSync(env: SoiiEnv): boolean {
  return Boolean(env.vaultPath)
}

/**
 * `push`: after a successful pull, push local commits if the branch has an upstream and is ahead of it
 * (local mode, where soii's own writes are local commits). Never force, never merge or rebase: a diverged
 * vault fails the pull and nothing is pushed.
 */
export async function syncVault(env: SoiiEnv, git: RunGit = runGit, opts: { push?: boolean } = {}): Promise<SyncResult> {
  if (!canSync(env) || !env.vaultPath) {
    return { ok: false, status: 501, error: 'sync_not_available', message: 'Sync needs a local vault (VAULT_PATH).' }
  }
  if (!existsSync(join(env.vaultPath, '.git'))) {
    return { ok: false, status: 409, error: 'not_a_repo', message: 'The vault folder is not a git repository.' }
  }
  const pull = await git(env.vaultPath, ['pull', '--ff-only'])
  if (pull.code !== 0) {
    const reason = pull.out.split('\n').find(l => /error|fatal|conflict|overwritten|diverge/i.test(l)) ?? pull.out.split('\n').pop() ?? 'git pull failed'
    return { ok: false, status: 409, error: 'pull_failed', message: `git pull failed: ${reason.slice(0, 200)}` }
  }
  const changed = !/already up.to.date/i.test(pull.out)
  const summary = changed ? 'Pulled the latest notes.' : 'Already up to date.'
  if (!opts.push) return { ok: true, changed, summary }
  const pushed = await pushAhead(env.vaultPath, git)
  return { ok: true, changed, pushed: pushed.pushed, summary: pushed.note ? `${summary} ${pushed.note}` : summary }
}

async function pushAhead(cwd: string, git: RunGit): Promise<{ pushed: boolean; note: string }> {
  const ahead = await git(cwd, ['rev-list', '--count', '@{u}..HEAD'])
  const count = ahead.code === 0 ? Number(ahead.out) : 0
  if (!(count > 0)) return { pushed: false, note: '' }
  const push = await git(cwd, ['push'])
  if (push.code !== 0) {
    const reason = push.out.split('\n').find(l => /denied|rejected|fatal|error|refused/i.test(l)) ?? push.out.split('\n').pop() ?? 'git push failed'
    return { pushed: false, note: `Couldn't push ${count === 1 ? '1 commit' : `${count} commits`}: ${reason.slice(0, 200)}` }
  }
  return { pushed: true, note: `Pushed ${count === 1 ? '1 commit' : `${count} commits`}.` }
}
