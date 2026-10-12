// app/server/sync.test.ts
import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from './env'
import { canSync, syncVault, type RunGit } from './sync'

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'soii-sync-'))
  mkdirSync(join(d, '.git'))
  return d
}

describe('syncVault', () => {
  test('is unavailable without VAULT_PATH and on Vercel', async () => {
    expect(canSync(readEnv({}))).toBe(false)
    expect(canSync(readEnv({ VAULT_PATH: '/v', VERCEL: '1' }))).toBe(false)
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
    expect(seen).toEqual([{ cwd: d, args: ['pull', '--ff-only'] }])
  })

  test('reports changes', async () => {
    const out = 'Updating a..b\nFast-forward\n x.md | 1 +\n'
    expect(await syncVault(readEnv({ VAULT_PATH: repo() }), async () => ({ code: 0, out }))).toMatchObject({ ok: true, changed: true })
  })

  test('surfaces a failed pull instead of hiding it', async () => {
    const out = 'error: Your local changes to the following files would be overwritten by merge:\n\tnotes.md\nAborting'
    const r = await syncVault(readEnv({ VAULT_PATH: repo() }), async () => ({ code: 1, out }))
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
    expect(calls.map(c => c.join(' '))).toEqual(['pull --ff-only', 'rev-list --count @{u}..HEAD', 'push'])
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

  test('a failed pull stops before any push, so soii never pushes over a diverged vault', async () => {
    const { git, calls } = scripted({ pull: { code: 1, out: 'fatal: Not possible to fast-forward, aborting.' } })
    expect(await syncVault(env(), git, { push: true })).toMatchObject({ ok: false, error: 'pull_failed' })
    expect(calls.map(c => c[0])).toEqual(['pull'])
  })

  test('without the push option nothing but the pull runs (dev mode is unchanged)', async () => {
    const { git, calls } = scripted({ pull: { code: 0, out: 'Already up to date.' } })
    await syncVault(env(), git)
    expect(calls.map(c => c[0])).toEqual(['pull'])
  })
})
