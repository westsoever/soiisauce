import { describe, expect, test } from 'bun:test'
import { createVersionChecker, gitLsRemote, RELEASES_URL } from './version'
import type { RunGit } from './sync'

const TAGS = (...tags: string[]) => tags.map(t => `abc123\trefs/tags/${t}`).join('\n')

/** A checker with a scripted remote and timers it can fire by hand. */
function rig(opts: { installed?: string | null; answers: (string | null)[]; refreshMs?: number; retryMs?: number }) {
  const answers = [...opts.answers]
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = []
  let calls = 0
  const checker = createVersionChecker({
    installed: opts.installed === undefined ? '0.1.2' : opts.installed,
    lsRemote: async () => {
      calls++
      return answers.length > 1 ? answers.shift()! : answers[0]
    },
    refreshMs: opts.refreshMs,
    retryMs: opts.retryMs,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false }
      timers.push(t)
      return t
    },
    clearTimer: t => {
      ;(t as { cleared: boolean }).cleared = true
    }
  })
  return { checker, timers, calls: () => calls }
}

describe('createVersionChecker', () => {
  test('before the first check nothing is known and nothing is offered', () => {
    const { checker } = rig({ answers: [TAGS('v0.1.3')] })
    expect(checker.info()).toEqual({ installed: 'v0.1.2', latest: null, updateAvailable: false, releaseUrl: null })
  })

  test('a newer tag is an update, with the installed version and the release page', async () => {
    const { checker } = rig({ answers: [TAGS('v0.1.0', 'v0.1.2', 'v0.1.3')] })
    await checker.refresh()
    expect(checker.info()).toEqual({ installed: 'v0.1.2', latest: 'v0.1.3', updateAvailable: true, releaseUrl: `${RELEASES_URL}v0.1.3` })
  })

  test('the same version, or a newer one than the latest tag, is not an update', async () => {
    const same = rig({ answers: [TAGS('v0.1.2')] })
    await same.checker.refresh()
    expect(same.checker.info()).toMatchObject({ latest: 'v0.1.2', updateAvailable: false })
    const ahead = rig({ installed: '0.2.0', answers: [TAGS('v0.1.2')] })
    await ahead.checker.refresh()
    expect(ahead.checker.info().updateAvailable).toBe(false)
  })

  test('0.10.0 is newer than 0.9.0', async () => {
    const r = rig({ installed: '0.9.0', answers: [TAGS('v0.10.0', 'v0.9.0')] })
    await r.checker.refresh()
    expect(r.checker.info()).toMatchObject({ latest: 'v0.10.0', updateAvailable: true })
  })

  test('an unknown installed version never claims an update', async () => {
    const r = rig({ installed: null, answers: [TAGS('v0.1.3')] })
    await r.checker.refresh()
    expect(r.checker.info()).toEqual({ installed: null, latest: 'v0.1.3', updateAvailable: false, releaseUrl: `${RELEASES_URL}v0.1.3` })
  })

  test('a v-prefixed installed version is normalised', () => {
    expect(rig({ installed: 'v0.1.2', answers: [null] }).checker.info().installed).toBe('v0.1.2')
  })

  test('pre-release and other tags are ignored', async () => {
    const r = rig({ answers: [TAGS('v0.2.0-rc1', 'nightly', 'v0.1.3')] })
    await r.checker.refresh()
    expect(r.checker.info().latest).toBe('v0.1.3')
  })

  test('an offline check fails silently and keeps what it knew', async () => {
    const r = rig({ answers: [TAGS('v0.1.3'), null] })
    await r.checker.refresh()
    await r.checker.refresh()
    expect(r.checker.info()).toMatchObject({ latest: 'v0.1.3', updateAvailable: true })
  })

  test('a check that finds no release tags is not an error and offers nothing', async () => {
    const r = rig({ answers: ['abc\trefs/heads/main'] })
    await r.checker.refresh()
    expect(r.checker.info()).toMatchObject({ latest: null, updateAvailable: false })
  })

  test('ensureStarted checks once, however often it is called', async () => {
    const r = rig({ answers: [TAGS('v0.1.3')] })
    r.checker.ensureStarted()
    r.checker.ensureStarted()
    await r.checker.refresh() // joins the check that start began
    expect(r.calls()).toBe(1)
    r.checker.ensureStarted()
    await r.checker.refresh() // nothing in flight any more: a new check, but not a second start
    expect(r.calls()).toBe(2)
  })

  test('overlapping refreshes share one request', async () => {
    const r = rig({ answers: [TAGS('v0.1.3')] })
    await Promise.all([r.checker.refresh(), r.checker.refresh(), r.checker.refresh()])
    expect(r.calls()).toBe(1)
  })

  test('after a good check the next one is in six hours, after a failed one in thirty minutes', async () => {
    const good = rig({ answers: [TAGS('v0.1.3')] })
    good.checker.ensureStarted()
    await good.checker.refresh()
    expect(good.timers.at(-1)?.ms).toBe(6 * 60 * 60 * 1000)
    const bad = rig({ answers: [null] })
    bad.checker.ensureStarted()
    await bad.checker.refresh()
    expect(bad.timers.at(-1)?.ms).toBe(30 * 60 * 1000)
  })

  test('the timer fires another check', async () => {
    const r = rig({ answers: [TAGS('v0.1.3')] })
    r.checker.ensureStarted()
    await r.checker.refresh()
    const before = r.calls()
    r.timers.at(-1)!.fn()
    await r.checker.refresh()
    expect(r.calls()).toBeGreaterThan(before)
  })

  test('stop cancels the pending check', async () => {
    const r = rig({ answers: [TAGS('v0.1.3')] })
    r.checker.ensureStarted()
    await r.checker.refresh()
    r.checker.stop()
    expect(r.timers.at(-1)?.cleared).toBe(true)
  })
})

describe('gitLsRemote', () => {
  test('runs `git ls-remote --tags <remote>` and returns its output', async () => {
    const seen: string[][] = []
    const git: RunGit = async (_cwd, args) => {
      seen.push(args)
      return { code: 0, out: 'abc\trefs/tags/v0.1.3' }
    }
    expect(await gitLsRemote('https://example.test/soii.git', git)()).toBe('abc\trefs/tags/v0.1.3')
    expect(seen).toEqual([['ls-remote', '--tags', 'https://example.test/soii.git']])
  })

  test('a failure (offline, no credentials) is null, not an exception', async () => {
    expect(await gitLsRemote('x', async () => ({ code: 128, out: 'fatal: could not read Username' }))()).toBeNull()
    expect(await gitLsRemote('x', async () => { throw new Error('spawn git ENOENT') })()).toBeNull()
  })
})
