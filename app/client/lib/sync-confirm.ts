// app/client/lib/sync-confirm.ts
// Sync pushes to the vault's GitHub repository, so the first time it is about to push to a remote the page names it and
// asks. The remotes already agreed to are kept in this browser's storage; a different remote asks again.
const KEY = 'soii.sync.confirmed'

type Reader = Pick<Storage, 'getItem'> | undefined
type Writer = Pick<Storage, 'getItem' | 'setItem'> | undefined

export function confirmedRemotes(storage: Reader): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}

/** True when Sync is about to push somewhere the owner hasn't agreed to yet. With no remote, the server explains how to connect. */
export function needsConfirm(remote: string | null, confirmed: string[]): boolean {
  return remote !== null && !confirmed.includes(remote)
}

export function rememberRemote(storage: Writer, remote: string): void {
  try {
    const all = confirmedRemotes(storage)
    if (!all.includes(remote)) storage?.setItem(KEY, JSON.stringify([...all, remote]))
  } catch {
    // storage unavailable: it asks again next time
  }
}
