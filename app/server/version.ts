// app/server/version.ts
// "Is there a newer soii?" for local mode: `git ls-remote --tags` against soii's remote (what `soii update` uses), checked
// when the server starts and every six hours, cached, and served at /api/version. Offline or without git credentials
// it fails silently and keeps what it knew; nothing is shown until a check has found a newer release.
import { newestTag, isNewer } from '../cli/version'
import { releaseUrl } from '../cli/vault-files'
import type { VersionInfo } from '../lib/types'
import type { RunGit } from './sync'

export const RELEASES_URL = releaseUrl('')
export type { VersionInfo }

export interface VersionChecker {
  info(): VersionInfo
  /** Start checking (now, then on a timer). Safe to call on every request. */
  ensureStarted(): void
  refresh(): Promise<void>
  stop(): void
}

/** The output of `git ls-remote --tags <remote>`, or null when git can't get it. Never throws. */
export function gitLsRemote(remote: string, git: RunGit, cwd = process.cwd()): () => Promise<string | null> {
  return async () => {
    try {
      const r = await git(cwd, ['ls-remote', '--tags', remote])
      return r.code === 0 ? r.out : null
    } catch {
      return null
    }
  }
}

const SIX_HOURS = 6 * 60 * 60 * 1000
const THIRTY_MINUTES = 30 * 60 * 1000

export function createVersionChecker(o: {
  installed: string | null
  lsRemote: () => Promise<string | null>
  refreshMs?: number
  retryMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}): VersionChecker {
  const installed = o.installed ? `v${o.installed.replace(/^v/, '')}` : null
  const setTimer =
    o.setTimer ??
    ((fn, ms) => {
      const handle = setTimeout(fn, ms)
      handle.unref?.() // never keeps the process alive
      return handle
    })
  const clearTimer = o.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let latest: string | null = null
  let started = false
  let timer: unknown
  let inflight: Promise<void> | null = null

  const schedule = (ms: number) => {
    if (timer !== undefined) clearTimer(timer)
    timer = setTimer(() => void refresh(), ms)
  }

  function refresh(): Promise<void> {
    inflight ??= (async () => {
      const out = await o.lsRemote()
      if (out !== null) latest = newestTag(out) ?? latest
      // A failed check is retried sooner than a good one is repeated.
      if (started) schedule(out !== null ? (o.refreshMs ?? SIX_HOURS) : (o.retryMs ?? THIRTY_MINUTES))
    })().finally(() => {
      inflight = null
    })
    return inflight
  }

  return {
    info: () => ({
      installed,
      latest,
      updateAvailable: installed !== null && latest !== null && isNewer(installed, latest),
      releaseUrl: latest ? releaseUrl(latest) : null
    }),
    ensureStarted() {
      if (started) return
      started = true
      void refresh()
    },
    refresh,
    stop() {
      started = false
      if (timer !== undefined) clearTimer(timer)
      timer = undefined
    }
  }
}
