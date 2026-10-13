// Keeps an open page in step with the vault. The server rebuilds a second or so after a
// file changes (an Obsidian save, an agent's edit, a Sync). While
// the tab is visible, poll /api/health every few seconds and on focus, and when the build
// changes, refetch the index, notes and search in place: no reload, nothing flashes.
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from './http'

const POLL_MS = 5000

/** A build counts as new only against a known earlier one. null = unknown or the server is down mid-restart. */
export function isNewBuild(previous: string | null, next: string | null): boolean {
  return previous !== null && next !== null && next !== previous
}

export const builtAt = () => api<{ builtAt: string | null }>('/api/health').then(h => h.builtAt, () => null)
const fetchBuiltAt = builtAt
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** After a commit lands in the local vault, wait (≤ ~30 s) for the dev server's rebuild, then reload everything except me/capabilities. */
export async function waitForRebuild(queryClient: QueryClient, before: string | null): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    const now = await builtAt()
    if (now && now !== before) break
  }
  await queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'capabilities' })
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
        if (isNewBuild(last, next)) {
          await queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'capabilities' })
        }
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
