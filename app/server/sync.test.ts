// app/server/sync.test.ts
import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from './env'
import { canSync, redactUrl, runGit, syncSetup, syncVault, type RunGit } from './sync'

const UPSTREAM = ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'soii-sync-'))
  mkdirSync(join(d, '.git'))
  return d
}

describe('syncVault', () => {
  test('is unavailable without VAULT_PATH', async () => {
    expect(canSync(readEnv({}))).toBe(false)
    expect(canSync(readEnv({ VAULT_PATH: '/v' }))).toBe(true)
    expect(await syncVault(readEnv({}))).toMatchObject({ ok: false, status: 501 })
  })

  test('refuses a folder that is not a git repo', async () => {
    const d = mkdtempSync(join(tmpdir(), 'soii-nogit-'))
    expect(await syncVault(readEnv({ VAULT_PATH: d }))).toMatchObject({ ok: false, error: 'not_a_repo' })
  })

  test('runs a fast-forward-only pull in the vault folder', async () => {
    const d = repo()
    const seen: { cwd: string; args: string[] }[] = []
    const git: RunGit = async (cwd, args) => {
      seen.push({ cwd, args })
      return { code: 0, out: 'Already up to date.' }
    }
    expect(await syncVault(readEnv({ VAULT_PATH: d }), git)).toEqual({ ok: true, changed: false, summary: 'Already up to date.' })
    expect(seen).toEqual([
      { cwd: d, args: UPSTREAM },
      { cwd: d, args: ['pull', '--ff-only'] }
    ])
  })

  test('reports changes', async () => {
    const out = 'Updating a..b\nFast-forward\n x.md | 1 +\n'
    expect(await syncVault(readEnv({ VAULT_PATH: repo() }), async () => ({ code: 0, out }))).toMatchObject({ ok: true, changed: true })
  })

  test('surfaces a failed pull instead of hiding it', async () => {
    const out = 'error: Your local changes to the following files would be overwritten by merge:\n\tnotes.md\nAborting'
    const r = await syncVault(readEnv({ VAULT_PATH: repo() }), async (_cwd, args) => (args[0] === 'pull' ? { code: 1, out } : { code: 0, out: 'origin/main' }))
    expect(r).toMatchObject({ ok: false, status: 409, error: 'pull_failed' })
    expect(r.ok === false && r.message).toContain('would be overwritten')
  })
})

describe('syncVault with push (local mode)', () => {
  // A scripted git: answers by the subcommand it is asked.
  const scripted = (answers: Record<string, { code: number; out: string }>) => {
    const calls: string[][] = []
    const git: RunGit = async (_cwd, args) => {
      calls.push(args)
      const key = args[0] === 'rev-list' ? 'rev-list' : args[0]
      return answers[key] ?? { code: 0, out: '' }
    }
    return { git, calls }
  }
  const env = () => readEnv({ SOII_LOCAL: '1', VAULT_PATH: repo() })

  test('pushes when the vault is ahead of its upstream', async () => {
    const { git, calls } = scripted({ pull: { code: 0, out: 'Already up to date.' }, 'rev-list': { code: 0, out: '2' } })
    const r = await syncVault(env(), git, { push: true })
    expect(calls.map(c => c.join(' '))).toEqual([UPSTREAM.join(' '), 'pull --ff-only', 'rev-list --count @{u}..HEAD', 'push'])
    expect(r).toEqual({ ok: true, changed: false, pushed: true, summary: 'Already up to date. Pushed 2 commits.' })
  })

  test('says "1 commit" in the singular', async () => {
    const { git } = scripted({ pull: { code: 0, out: 'Already up to date.' }, 'rev-list': { code: 0, out: '1' } })
    expect(await syncVault(env(), git, { push: true })).toMatchObject({ summary: 'Already up to date. Pushed 1 commit.' })
  })

  test('does not push when there is nothing to push', async () => {
    const { git, calls } = scripted({ pull: { code: 0, out: 'Already up to date.' }, 'rev-list': { code: 0, out: '0' } })
    const r = await syncVault(env(), git, { push: true })
    expect(calls.some(c => c[0] === 'push')).toBe(false)
    expect(r).toEqual({ ok: true, changed: false, pushed: false, summary: 'Already up to date.' })
  })

  test('no upstream (no remote or branch not tracking) means no push, and no error', async () => {
    const { git, calls } = scripted({ pull: { code: 0, out: 'Already up to date.' }, 'rev-list': { code: 128, out: 'fatal: no upstream configured for branch' } })
    const r = await syncVault(env(), git, { push: true })
    expect(calls.some(c => c[0] === 'push')).toBe(false)
    expect(r).toMatchObject({ ok: true, pushed: false })
  })

  test('a failed push is reported, the pull result is kept, and nothing is thrown', async () => {
    const { git } = scripted({
      pull: { code: 0, out: 'Updating a..b\nFast-forward\n x.md | 1 +\n' },
      'rev-list': { code: 0, out: '1' },
      push: { code: 1, out: 'remote: Permission denied\nfatal: unable to access' }
    })
    const r = await syncVault(env(), git, { push: true })
    expect(r).toMatchObject({ ok: true, changed: true, pushed: false })
    expect(r.ok && r.summary).toContain('Pulled the latest notes.')
    expect(r.ok && r.summary).toContain("Couldn't push")
    expect(r.ok && r.summary).toContain('Permission denied')
  })

  test('a failed pull that is not a divergence stops before any push', async () => {
    const { git, calls } = scripted({
      pull: { code: 1, out: "fatal: unable to access 'https://github.com/x/v.git/': Could not resolve host" },
      'rev-list': { code: 0, out: '0' }
    })
    expect(await syncVault(env(), git, { push: true })).toMatchObject({ ok: false, error: 'pull_failed' })
    expect(calls.map(c => c[0])).not.toContain('merge')
    expect(calls.map(c => c[0])).not.toContain('push')
  })

  test('a diverged vault that merges cleanly is merged, then pushed (D125)', async () => {
    const { git, calls } = scripted({
      pull: { code: 128, out: 'fatal: Not possible to fast-forward, aborting.' },
      'rev-list': { code: 0, out: '2' },
      'merge-tree': { code: 0, out: 'abc123' },
      merge: { code: 0, out: "Merge made by the 'ort' strategy." },
      push: { code: 0, out: '' }
    })
    const r = await syncVault(env(), git, { push: true })
    expect(r).toMatchObject({ ok: true, changed: true, pushed: true })
    expect(r.ok && r.summary).toContain('Merged the latest notes with your 2 local commits.')
    const merge = calls.find(c => c[0] === 'merge')
    expect(merge).toEqual(['merge', '--no-edit', '@{u}'])
    expect(calls.map(c => c[0]).indexOf('merge-tree')).toBeLessThan(calls.map(c => c[0]).indexOf('merge'))
  })

  test('a diverged vault whose merge would conflict is left alone: no merge, no push', async () => {
    const { git, calls } = scripted({
      pull: { code: 128, out: 'fatal: Not possible to fast-forward, aborting.' },
      'rev-list': { code: 0, out: '1' },
      'merge-tree': { code: 1, out: 'abc123\n100644 x 1\tnotes.md\nCONFLICT (content): Merge conflict in notes.md' }
    })
    const r = await syncVault(env(), git, { push: true })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'pull_failed' })
    expect(r.ok === false && r.message).toContain('notes.md')
    expect(calls.map(c => c[0])).not.toContain('merge')
    expect(calls.map(c => c[0])).not.toContain('push')
  })

  test('without the push option a diverged vault still fails as before (dev mode is unchanged)', async () => {
    const { git, calls } = scripted({ pull: { code: 128, out: 'fatal: Not possible to fast-forward, aborting.' } })
    expect(await syncVault(env(), git)).toMatchObject({ ok: false, error: 'pull_failed' })
    expect(calls.map(c => c[0])).toEqual(['rev-parse', 'pull'])
  })

  test('without the push option nothing but the connection check and the pull run (dev mode is unchanged)', async () => {
    const { git, calls } = scripted({ pull: { code: 0, out: 'Already up to date.' } })
    await syncVault(env(), git)
    expect(calls.map(c => c[0])).toEqual(['rev-parse', 'pull'])
  })
})

// A scripted git for the connection check, keyed by the whole command line.
function remoteGit(answers: Record<string, { code: number; out: string }>) {
  const calls: string[] = []
  const git: RunGit = async (_cwd, args) => {
    const line = args.join(' ')
    calls.push(line)
    return answers[line] ?? { code: 1, out: '' }
  }
  return { git, calls }
}
const UP = UPSTREAM.join(' ')

describe('syncSetup: is the vault connected to a remote?', () => {
  test('ready, with the remote it talks to (credentials never shown)', async () => {
    const { git } = remoteGit({
      [UP]: { code: 0, out: 'origin/main' },
      remote: { code: 0, out: 'backup\norigin' },
      'remote get-url origin': { code: 0, out: 'https://me:ghp_secret@github.com/me/notes.git' }
    })
    expect(await syncSetup(readEnv({ VAULT_PATH: repo() }), git, { withRemote: true })).toEqual({ state: 'ready', remote: 'https://github.com/me/notes.git' })
  })

  test('ready without asking for the remote costs one git call', async () => {
    const { git, calls } = remoteGit({ [UP]: { code: 0, out: 'origin/main' } })
    expect(await syncSetup(readEnv({ VAULT_PATH: repo() }), git)).toEqual({ state: 'ready', remote: null })
    expect(calls).toEqual([UP])
  })

  test('a remote name with a slash in it is still found', async () => {
    const { git } = remoteGit({
      [UP]: { code: 0, out: 'team/origin/main' },
      remote: { code: 0, out: 'team\nteam/origin' },
      'remote get-url team/origin': { code: 0, out: 'git@github.com:me/notes.git' }
    })
    expect(await syncSetup(readEnv({ VAULT_PATH: repo() }), git, { withRemote: true })).toEqual({ state: 'ready', remote: 'git@github.com:me/notes.git' })
  })

  test('no remote at all: says so, plainly, and how to connect', async () => {
    const { git } = remoteGit({ remote: { code: 0, out: '' }, 'branch --show-current': { code: 0, out: 'main' } })
    const r = await syncSetup(readEnv({ VAULT_PATH: repo() }), git)
    expect(r).toMatchObject({ state: 'no_remote' })
    expect('message' in r && r.message).toContain("isn't connected to GitHub yet")
    expect('message' in r && r.message).toContain('git remote add origin')
    expect('message' in r && r.message).toContain('git push -u origin main')
  })

  test('a remote but a branch that tracks nothing: names the exact push', async () => {
    const { git } = remoteGit({ remote: { code: 0, out: 'github\n' }, 'branch --show-current': { code: 0, out: 'trunk' } })
    const r = await syncSetup(readEnv({ VAULT_PATH: repo() }), git)
    expect(r).toMatchObject({ state: 'no_upstream' })
    expect('message' in r && r.message).toContain('git push -u github trunk')
  })

  test('not on a branch: asks for the branch first', async () => {
    const { git } = remoteGit({ remote: { code: 0, out: 'origin' }, 'branch --show-current': { code: 0, out: '' } })
    const r = await syncSetup(readEnv({ VAULT_PATH: repo() }), git)
    expect(r).toMatchObject({ state: 'detached' })
    expect('message' in r && r.message).toContain('git switch')
  })

  test('not a git repository', async () => {
    const d = mkdtempSync(join(tmpdir(), 'soii-nogit-'))
    const r = await syncSetup(readEnv({ VAULT_PATH: d }), remoteGit({}).git)
    expect(r).toMatchObject({ state: 'no_repo' })
    expect('message' in r && r.message).toContain('git init')
  })
})

describe('syncVault when the vault is not connected', () => {
  test('answers 409 not_connected with the how-to, and never pulls or pushes', async () => {
    const { git, calls } = remoteGit({ remote: { code: 0, out: '' }, 'branch --show-current': { code: 0, out: 'main' } })
    const r = await syncVault(readEnv({ SOII_LOCAL: '1', VAULT_PATH: repo() }), git, { push: true })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'not_connected' })
    expect(r.ok === false && r.message).toContain('git remote add origin')
    expect(calls.some(c => c.startsWith('pull') || c.startsWith('push'))).toBe(false)
  })

  test('an unlinked branch is 409 not_connected as well', async () => {
    const { git } = remoteGit({ remote: { code: 0, out: 'origin' }, 'branch --show-current': { code: 0, out: 'main' } })
    expect(await syncVault(readEnv({ VAULT_PATH: repo() }), git)).toMatchObject({ ok: false, status: 409, error: 'not_connected' })
  })

  test('a folder that is not a repo keeps its own error code', async () => {
    const d = mkdtempSync(join(tmpdir(), 'soii-nogit-'))
    const r = await syncVault(readEnv({ VAULT_PATH: d }))
    expect(r).toMatchObject({ ok: false, status: 409, error: 'not_a_repo' })
    expect(r.ok === false && r.message).toContain('git init')
  })
})

describe('redactUrl', () => {
  test('drops a user and token from an https remote', () => {
    expect(redactUrl('https://me:ghp_secret@github.com/me/notes.git')).toBe('https://github.com/me/notes.git')
    expect(redactUrl('https://token@github.com/me/notes.git')).toBe('https://github.com/me/notes.git')
  })

  test('leaves ssh and plain URLs alone', () => {
    expect(redactUrl('git@github.com:me/notes.git')).toBe('git@github.com:me/notes.git')
    expect(redactUrl('https://github.com/me/notes.git')).toBe('https://github.com/me/notes.git')
    expect(redactUrl('/Users/me/remote.git')).toBe('/Users/me/remote.git')
  })
})

describe('with real git repositories', () => {
  const sh = (cwd: string, ...args: string[]) => {
    const r = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
    if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`)
    return r.stdout.toString().trim()
  }
  const vault = () => {
    const d = mkdtempSync(join(tmpdir(), 'soii-realgit-'))
    sh(d, 'init', '-q', '-b', 'main')
    writeFileSync(join(d, 'a.md'), '# a\n')
    sh(d, 'add', '-A')
    sh(d, 'commit', '-q', '-m', 'first')
    return d
  }

  test('no remote, then a remote without a tracking branch, then connected', async () => {
    const d = vault()
    const env = readEnv({ VAULT_PATH: d })
    expect(await syncSetup(env)).toMatchObject({ state: 'no_remote' })
    const bare = mkdtempSync(join(tmpdir(), 'soii-bare-'))
    sh(bare, 'init', '-q', '--bare')
    sh(d, 'remote', 'add', 'origin', bare)
    const unlinked = await syncSetup(env)
    expect(unlinked).toMatchObject({ state: 'no_upstream' })
    expect('message' in unlinked && unlinked.message).toContain('git push -u origin main')
    sh(d, 'push', '-q', '-u', 'origin', 'main')
    expect(await syncSetup(env, runGit, { withRemote: true })).toEqual({ state: 'ready', remote: bare })
  })

  test('Sync with no remote is the plain message, and leaves the vault untouched', async () => {
    const d = vault()
    const before = sh(d, 'rev-parse', 'HEAD')
    const r = await syncVault(readEnv({ SOII_LOCAL: '1', VAULT_PATH: d }), runGit, { push: true })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'not_connected' })
    expect(r.ok === false && r.message).not.toMatch(/fatal|usage:|There is no tracking information/i)
    expect(sh(d, 'rev-parse', 'HEAD')).toBe(before)
  })

  test('a connected vault pulls and pushes', async () => {
    const d = vault()
    const bare = mkdtempSync(join(tmpdir(), 'soii-bare-'))
    sh(bare, 'init', '-q', '--bare')
    sh(d, 'remote', 'add', 'origin', bare)
    sh(d, 'push', '-q', '-u', 'origin', 'main')
    writeFileSync(join(d, 'b.md'), '# b\n')
    sh(d, 'add', '-A')
    sh(d, 'commit', '-q', '-m', 'soii: add b')
    const r = await syncVault(readEnv({ SOII_LOCAL: '1', VAULT_PATH: d }), runGit, { push: true })
    expect(r).toMatchObject({ ok: true, pushed: true })
    expect(sh(bare, 'log', '--format=%s', '-1', 'main')).toBe('soii: add b')
  })

  // A vault and a second clone ("another machine or agent") that share one bare remote.
  const diverged = () => {
    const d = vault()
    const bare = mkdtempSync(join(tmpdir(), 'soii-bare-'))
    sh(bare, 'init', '-q', '--bare', '-b', 'main')
    sh(d, 'remote', 'add', 'origin', bare)
    sh(d, 'push', '-q', '-u', 'origin', 'main')
    const other = mkdtempSync(join(tmpdir(), 'soii-other-'))
    sh(other, 'clone', '-q', bare, '.')
    for (const r of [d, other]) {
      // Sync's own merge commit runs without the helper's -c flags: give both clones an identity of their own.
      sh(r, 'config', 'user.name', 't')
      sh(r, 'config', 'user.email', 't@example.invalid')
      sh(r, 'config', 'commit.gpgsign', 'false')
    }
    const commit = (cwd: string, file: string, text: string, msg: string) => {
      mkdirSync(join(cwd, file, '..'), { recursive: true })
      writeFileSync(join(cwd, file), text)
      sh(cwd, 'add', '--', file)
      sh(cwd, 'commit', '-q', '-m', msg)
    }
    return { d, bare, other, commit, env: readEnv({ SOII_LOCAL: '1', VAULT_PATH: d }) }
  }

  test('D125: a capture made here and a note filed elsewhere are merged and pushed, uncommitted work untouched', async () => {
    const { d, bare, other, commit, env } = diverged()
    commit(other, '04-Resources/Backlog/filed.md', '# filed\n', 'inbox: file 1 item')
    sh(other, 'push', '-q', 'origin', 'main')
    commit(d, '00-Inbox/capture.md', '# capture\n', 'soii: capture "capture"')
    writeFileSync(join(d, 'draft.md'), 'not committed\n') // the owner's own work in progress
    writeFileSync(join(d, 'a.md'), '# a, edited but not committed\n')
    const r = await syncVault(env, runGit, { push: true })
    expect(r).toMatchObject({ ok: true, changed: true, pushed: true })
    expect(r.ok && r.summary).toContain('Merged the latest notes with your 1 local commit.')
    const onRemote = sh(bare, 'ls-tree', '-r', '--name-only', 'main').split('\n')
    expect(onRemote).toContain('00-Inbox/capture.md')
    expect(onRemote).toContain('04-Resources/Backlog/filed.md')
    expect(sh(bare, 'log', '--format=%s', 'main')).toContain('inbox: file 1 item')
    expect(await Bun.file(join(d, 'draft.md')).text()).toBe('not committed\n')
    expect(await Bun.file(join(d, 'a.md')).text()).toBe('# a, edited but not committed\n')
  })

  test('D125: both sides changed the same note: nothing merged, nothing pushed, the vault as it was', async () => {
    const { d, bare, other, commit, env } = diverged()
    commit(other, 'a.md', '# a from elsewhere\n', 'elsewhere')
    sh(other, 'push', '-q', 'origin', 'main')
    commit(d, 'a.md', '# a from here\n', 'here')
    const head = sh(d, 'rev-parse', 'HEAD')
    const remote = sh(bare, 'rev-parse', 'main')
    const r = await syncVault(env, runGit, { push: true })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'pull_failed' })
    expect(r.ok === false && r.message).toContain('a.md')
    expect(sh(d, 'rev-parse', 'HEAD')).toBe(head)
    expect(sh(bare, 'rev-parse', 'main')).toBe(remote)
    expect(sh(d, 'status', '--porcelain')).toBe('')
    expect(Bun.spawnSync(['git', 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: d }).exitCode).not.toBe(0)
  })

  test('D125: an uncommitted edit to a note GitHub changed stops the merge and keeps the edit', async () => {
    const { d, bare, other, commit, env } = diverged()
    commit(other, 'a.md', '# a from elsewhere\n', 'elsewhere')
    sh(other, 'push', '-q', 'origin', 'main')
    commit(d, '00-Inbox/capture.md', '# capture\n', 'capture')
    writeFileSync(join(d, 'a.md'), '# my unsaved edit\n')
    const head = sh(d, 'rev-parse', 'HEAD')
    const remote = sh(bare, 'rev-parse', 'main')
    const r = await syncVault(env, runGit, { push: true })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'pull_failed' })
    expect(sh(d, 'rev-parse', 'HEAD')).toBe(head)
    expect(sh(bare, 'rev-parse', 'main')).toBe(remote)
    expect(await Bun.file(join(d, 'a.md')).text()).toBe('# my unsaved edit\n')
    expect(Bun.spawnSync(['git', 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: d }).exitCode).not.toBe(0)
  })
})
