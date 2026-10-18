// app/server/sync.ts
// The sidebar's Sync button: `git pull --ff-only` in the local vault (VAULT_PATH), and in local mode a push of what
// soii committed. The server already watches that folder, so pulled files trigger the rebuild.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SoiiEnv } from './env'

export type SyncResult =
  | { ok: true; changed: boolean; summary: string; pushed?: boolean }
  | { ok: false; status: 409 | 500 | 501; error: string; message: string }

/** Whether Sync has anywhere to go: the branch tracks a branch on a remote. Otherwise `message` says what to do. */
export type SyncSetup =
  | { state: 'ready'; remote: string | null }
  | { state: 'no_repo' | 'no_remote' | 'no_upstream' | 'detached'; message: string }

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

/** A remote URL without the user and token an https remote may carry. Anything that isn't a URL (ssh, a path) stays as it is. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    if (!u.username && !u.password) return url
    u.username = ''
    u.password = ''
    return u.toString()
  } catch {
    return url
  }
}

const lines = (out: string): string[] => out.split('\n').map(l => l.trim()).filter(Boolean)

/**
 * Is the vault connected to a remote, so that Sync has somewhere to pull from and push to? Decided from git's exit codes,
 * not its messages. `withRemote` also looks up which remote that is (for the confirmation before the first push).
 */
export async function syncSetup(env: SoiiEnv, git: RunGit = runGit, opts: { withRemote?: boolean } = {}): Promise<SyncSetup> {
  const vault = env.vaultPath ?? ''
  if (!existsSync(join(vault, '.git'))) {
    return { state: 'no_repo', message: "The vault folder isn't a git repository, so there is nothing to sync. Run `git init` in it, commit your notes, then connect it to a GitHub repository." }
  }
  const upstream = await git(vault, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (upstream.code === 0) {
    if (!opts.withRemote) return { state: 'ready', remote: null }
    const names = lines((await git(vault, ['remote'])).out)
    // The upstream reads "<remote>/<branch>", and a remote's own name may hold a slash: take the longest that fits.
    const name = names.filter(n => upstream.out.startsWith(`${n}/`)).sort((a, b) => b.length - a.length)[0]
    const url = name ? (await git(vault, ['remote', 'get-url', name])).out.trim() : ''
    return { state: 'ready', remote: url ? redactUrl(url) : (name ?? null) }
  }
  const remotes = lines((await git(vault, ['remote'])).out)
  const branch = (await git(vault, ['branch', '--show-current'])).out.trim()
  if (!branch) {
    return { state: 'detached', message: "The vault isn't on a branch right now, so there is nothing to sync. Run `git switch main` (or your usual branch) in the vault folder, then try again." }
  }
  if (remotes.length === 0) {
    return {
      state: 'no_remote',
      message: `This vault isn't connected to GitHub yet, so there is nothing to sync with. Create an empty repository on GitHub, then run this in your vault folder: git remote add origin <the repository's URL> && git push -u origin ${branch}`
    }
  }
  return { state: 'no_upstream', message: `This vault's branch (${branch}) isn't linked to GitHub yet. Run this in your vault folder: git push -u ${remotes[0]} ${branch}` }
}

/**
 * `push`: after a successful pull, push local commits if the branch has an upstream and is ahead of it
 * (local mode, where soii's own writes are local commits). Never force, never rebase. A diverged vault (its own
 * captures here, an agent's or another machine's commits on GitHub) is merged only when git says the merge is clean
 * and touches no uncommitted edit (D125); otherwise the pull fails and nothing changes or is pushed.
 */
export async function syncVault(env: SoiiEnv, git: RunGit = runGit, opts: { push?: boolean } = {}): Promise<SyncResult> {
  if (!canSync(env) || !env.vaultPath) {
    return { ok: false, status: 501, error: 'sync_not_available', message: 'Sync needs a local vault (VAULT_PATH).' }
  }
  const setup = await syncSetup(env, git)
  if (setup.state !== 'ready') {
    return { ok: false, status: 409, error: setup.state === 'no_repo' ? 'not_a_repo' : 'not_connected', message: setup.message }
  }
  const pull = await git(env.vaultPath, ['pull', '--ff-only'])
  if (pull.code !== 0) {
    const merged = opts.push ? await mergeDiverged(env.vaultPath, git) : null
    if (merged?.ok) {
      const pushed = await pushAhead(env.vaultPath, git)
      const summary = `Merged the latest notes with your ${merged.local === 1 ? '1 local commit' : `${merged.local} local commits`}.`
      return { ok: true, changed: true, pushed: pushed.pushed, summary: pushed.note ? `${summary} ${pushed.note}` : summary }
    }
    if (merged) return { ok: false, status: 409, error: 'pull_failed', message: merged.message }
    const reason = pull.out.split('\n').find(l => /error|fatal|conflict|overwritten|diverge/i.test(l)) ?? pull.out.split('\n').pop() ?? 'git pull failed'
    return { ok: false, status: 409, error: 'pull_failed', message: `git pull failed: ${reason.slice(0, 200)}` }
  }
  const changed = !/already up.to.date/i.test(pull.out)
  const summary = changed ? 'Pulled the latest notes.' : 'Already up to date.'
  if (!opts.push) return { ok: true, changed, summary }
  const pushed = await pushAhead(env.vaultPath, git)
  return { ok: true, changed, pushed: pushed.pushed, summary: pushed.note ? `${summary} ${pushed.note}` : summary }
}

/**
 * After a fast-forward pull failed (it fetched first): if the vault and its upstream both have new commits, merge the
 * upstream in, but only when `git merge-tree` says the merge is clean. `null` means this isn't a divergence (offline,
 * no credentials, …), so the pull's own error stands. git refuses a merge that would overwrite an uncommitted edit
 * before changing anything; an unexpected half-done merge is aborted, so the vault never stays mid-merge.
 */
async function mergeDiverged(cwd: string, git: RunGit): Promise<{ ok: true; local: number } | { ok: false; message: string } | null> {
  const count = async (range: string) => {
    const r = await git(cwd, ['rev-list', '--count', range])
    return r.code === 0 ? Number(r.out) : 0
  }
  const local = await count('@{u}..HEAD')
  const remote = await count('HEAD..@{u}')
  if (!(local > 0 && remote > 0)) return null
  const check = await git(cwd, ['merge-tree', '--write-tree', '--no-messages', '--name-only', 'HEAD', '@{u}'])
  if (check.code === 1) {
    const files = check.out.split('\n').slice(1).map(l => l.trim()).filter(Boolean).slice(0, 5)
    return {
      ok: false,
      message: `Your notes and GitHub both changed ${files.length ? files.join(', ') : 'the same note'}, so Sync changed nothing. Merge them by hand (or ask Claude to), then Sync again.`
    }
  }
  if (check.code !== 0) return null // a git without merge-tree --write-tree (before 2.38): keep the old refusal
  const merge = await git(cwd, ['merge', '--no-edit', '@{u}'])
  if (merge.code !== 0) {
    if ((await git(cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).code === 0) await git(cwd, ['merge', '--abort'])
    const reason = merge.out.split('\n').find(l => /error|fatal|overwritten|conflict/i.test(l)) ?? merge.out.split('\n').pop() ?? 'git merge failed'
    return { ok: false, message: `GitHub has new notes, but Sync couldn't merge them: ${reason.slice(0, 200)}` }
  }
  return { ok: true, local }
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
