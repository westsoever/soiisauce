import { describe, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { indexOf } from '../../lib/life-test-utils'
import type { VaultIndex } from '../../lib/types'
import { keys } from './queries'
import { isNewBuild, refetchBuild } from './use-fresh-vault'

describe('isNewBuild', () => {
  test('only a different build after a known one counts', () => {
    expect(isNewBuild('2026-10-12T08:00:00Z', '2026-10-12T08:00:05Z')).toBe(true)
    expect(isNewBuild('2026-10-12T08:00:00Z', '2026-10-12T08:00:00Z')).toBe(false)
  })

  test('no baseline yet, or the server is restarting, is not a change', () => {
    expect(isNewBuild(null, '2026-10-12T08:00:05Z')).toBe(false)
    expect(isNewBuild('2026-10-12T08:00:00Z', null)).toBe(false)
  })
})

describe('refetchBuild', () => {
  // Between a rebuild and the server's restart, /api/health already reports the new build
  // while the old process still serves the old index (D126).
  const index = (builtAt: string) => ({ ...indexOf([]), builtAt })

  test('an index from before the build is never shown; the build is taken once it is served', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(keys.vault, index('2026-10-20T10:00:00Z'))
    queryClient.setQueryData(keys.note('a'), { stale: true })
    const served = [index('2026-10-20T10:00:00Z'), index('2026-10-20T10:00:09Z')]
    const fetchIndex = async () => served.shift()!

    expect(await refetchBuild(queryClient, '2026-10-20T10:00:09Z', fetchIndex)).toBe(false)
    expect(queryClient.getQueryData<VaultIndex>(keys.vault)?.builtAt).toBe('2026-10-20T10:00:00Z')
    expect(queryClient.getQueryState(keys.note('a'))?.isInvalidated).toBe(false)

    expect(await refetchBuild(queryClient, '2026-10-20T10:00:09Z', fetchIndex)).toBe(true)
    expect(queryClient.getQueryData<VaultIndex>(keys.vault)?.builtAt).toBe('2026-10-20T10:00:09Z')
    expect(queryClient.getQueryState(keys.note('a'))?.isInvalidated).toBe(true)
  })

  test('the server down mid-restart is "try again"', async () => {
    expect(await refetchBuild(new QueryClient(), '2026-10-20T10:00:09Z', () => Promise.reject(new Error('offline')))).toBe(false)
  })
})
