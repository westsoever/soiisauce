// app/client/lib/storage.ts
// Per-browser preferences in localStorage (last tab per workspace, open folders).
// Never throws: private mode or a full quota just means no memory.
export const storageKeys = {
  lastTab: (workspace: string) => `soii:last-tab:${workspace}`,
  openFolders: 'soii:open-folders',
  logDraft: 'soii:log-draft',
  lastLogKind: 'soii:log-kind',
  currency: 'soii:currency',
  speedWpm: 'soii:speed-wpm',
  browseLayout: (workspace: string, tab: string) => `soii:browse-layout:${workspace}/${tab}`
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}
