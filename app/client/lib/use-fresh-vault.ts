// Keeps an open page in step with the vault. The server rebuilds a second or so after a
// file changes (an Obsidian save, an agent's edit, a Sync). While
// the tab is visible, poll /api/health every few seconds and on focus, and when the build
// changes, refetch the index, notes and search in place: no reload, nothing flashes.
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { VaultIndex } from '../../lib/types'
import { api } from './http'
import { keys } from './queries'

const POLL_MS = 5000

/** A build counts as new only against a known earlier one. null = unknown or the server is down mid-restart. */
export function isNewBuild(previous: string | null, next: string | null): boolean {
  return previous !== null && next !== null && next !== previous
}

export const builtAt = () => api<{ builtAt: string | null }>('/api/health').then(h => h.builtAt, () => null)
const fetchBuiltAt = builtAt
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const reloadAll = (queryClient: QueryClient) => queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'capabilities' })

/**
 * Take the index only once it is `build`, then reload everything else except me/capabilities; false = try
 * again later. Between a rebuild and the server's restart, /api/health already reports the new build while
 * the old process still serves the old index, and a plain reload would put the old notes back (D126).
 */
export async function refetchBuild(queryClient: QueryClient, build: string, fetchIndex = () => api<VaultIndex>('/api/vault')): Promise<boolean> {
  const index = await fetchIndex().catch(() => null)
  if (index?.builtAt !== build) return false
  queryClient.setQueryData(keys.vault, index)
  await queryClient.invalidateQueries({ predicate: q => !['me', 'capabilities', keys.vault[0]].includes(q.queryKey[0] as string) })
  return true
}

/** After a commit lands in the local vault, wait (≤ ~30 s) for the dev server's rebuild, then reload everything except me/capabilities. */
export async function waitForRebuild(queryClient: QueryClient, before: string | null): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    const now = await builtAt()
    if (now && now !== before && (await refetchBuild(queryClient, now))) return
  }
  await reloadAll(queryClient)
}

export function useFreshVault(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    let last: string | null = null
    let busy = false
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const next = await fetchBuiltAt()
        // Still the old index: keep `last`, so the next check reloads again.
        if (isNewBuild(last, next) && !(await refetchBuild(queryClient, next!))) return
        if (next) last = next
      } finally {
        busy = false
      }
    }
    void check()
    const timer = setInterval(check, POLL_MS)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [queryClient])
}
