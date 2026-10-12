// app/client/lib/router.ts
// A small history router (pattern from miso-app). Routes (spec §6.3):
//   /                      → home (redirects to the home workspace)
//   /w/<workspace>[/<tab>] → a workspace tab
//   /n/<note id>           → the reader (id percent-encoded per segment)
//   /vault                 → folder tree + recent notes
//   /skills                → the Claude Code skills in the vault, and the soii commands
//   /log[/<kind>]          → the Log (pick a kind, then the form)
import { useMemo, useSyncExternalStore } from 'react'
import { decodePath } from '../../lib/paths'

export type Route =
  | { page: 'home' }
  | { page: 'workspace'; workspace: string; tab?: string }
  | { page: 'note'; id: string }
  | { page: 'vault' }
  | { page: 'skills' }
  | { page: 'log'; kind?: string }
  | { page: 'not-found' }

const listeners = new Set<() => void>()
let inAppDepth = 0

function emit(): void {
  for (const listener of listeners) listener()
}

// Guarded so parseRoute can be tested outside a browser.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    inAppDepth = Math.max(0, inAppDepth - 1)
    emit()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === location.pathname + location.search + location.hash) return
  if (options.replace) history.replaceState(null, '', to)
  else {
    history.pushState(null, '', to)
    inAppDepth++
  }
  emit()
}

export function canGoBack(): boolean {
  return inAppDepth > 0
}

/** Back within soii when there's somewhere to go back to, else home. */
export function goBack(): void {
  if (canGoBack()) history.back()
  else navigate('/')
}

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return { page: 'home' }
  const [head, ...rest] = parts
  if (head === 'vault' && rest.length === 0) return { page: 'vault' }
  if (head === 'skills' && rest.length === 0) return { page: 'skills' }
  if (head === 'log' && rest.length <= 1) {
    if (rest.length === 0) return { page: 'log' }
    const kind = decodePath(rest[0])
    return kind ? { page: 'log', kind } : { page: 'not-found' }
  }
  if (head === 'n' && rest.length > 0) {
    const id = decodePath(rest.join('/'))
    return id ? { page: 'note', id } : { page: 'not-found' }
  }
  if (head === 'w' && (rest.length === 1 || rest.length === 2)) {
    const decoded = rest.map(decodePath)
    if (decoded.some(p => p === null)) return { page: 'not-found' }
    return { page: 'workspace', workspace: decoded[0] as string, tab: (decoded[1] as string | undefined) ?? undefined }
  }
  return { page: 'not-found' }
}

export function workspacePath(workspace: string, tab?: string): string {
  return `/w/${encodeURIComponent(workspace)}${tab ? `/${encodeURIComponent(tab)}` : ''}`
}

export function logPath(kind?: string): string {
  return kind ? `/log/${encodeURIComponent(kind)}` : '/log'
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => location.pathname, () => '/')
  return useMemo(() => parseRoute(pathname), [pathname])
}

/** location.search, re-rendering on navigation (views like feed keep state in ?d=). */
export function useLocationSearch(): string {
  return useSyncExternalStore(subscribe, () => location.search, () => '')
}
