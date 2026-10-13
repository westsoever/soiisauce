// app/client/lib/queries.ts
// Server state (TanStack Query). The vault index loads once per page view;
// a new deploy is picked up on reload (spec §17).
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { noteApiPath, texApiPath } from '../../lib/paths'
import type { Me, NoteDoc, NoteId, SearchResult, VaultIndex, VersionInfo } from '../../lib/types'
import { api, fetchBlob } from './http'

export const keys = {
  me: ['me'] as const,
  vault: ['vault'] as const,
  capabilities: ['capabilities'] as const,
  version: ['version'] as const,
  note: (id: NoteId) => ['note', id] as const,
  tex: (id: NoteId) => ['tex', id] as const,
  search: (q: string) => ['search', q] as const
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/api/me'), staleTime: Infinity, retry: false })
}

export function useVault() {
  return useQuery({ queryKey: keys.vault, queryFn: () => api<VaultIndex>('/api/vault'), staleTime: Infinity })
}

export function useNote(id: NoteId | null) {
  return useQuery({
    queryKey: keys.note(id ?? ''),
    queryFn: () => api<NoteDoc>(noteApiPath(id ?? '')),
    enabled: id !== null && id !== '',
    staleTime: Infinity
  })
}

export function useSearch(q: string) {
  const query = q.trim()
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query)}&limit=20`).then(r => r.results),
    enabled: query.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData
  })
}

export interface Capabilities {
  write: boolean
  writeVia: 'github' | 'local' | null
  sync: boolean
}

export function useCapabilities() {
  return useQuery({ queryKey: keys.capabilities, queryFn: () => api<Capabilities>('/api/capabilities'), staleTime: Infinity, retry: false })
}

const HALF_HOUR = 30 * 60_000

/**
 * Is there a newer soii? The server checks GitHub at startup and every six hours (and right after a Sync) and caches; this asks the server. Right after
 * the server starts it may not know yet, so an empty answer is asked again soon. A failure is just "no notice".
 */
export function useVersion() {
  return useQuery({
    queryKey: keys.version,
    queryFn: () => api<VersionInfo>('/api/version'),
    staleTime: 5 * 60_000,
    retry: false,
    refetchInterval: query => (query.state.data?.latest ? HALF_HOUR : 30_000)
  })
}

/** The compiled PDF of a .tex note. Asked for on every open; the server's cache makes an unchanged file cheap. */
export function useTexPdf(id: NoteId) {
  return useQuery({ queryKey: keys.tex(id), queryFn: () => fetchBlob(texApiPath(id)), staleTime: 0, gcTime: 0, retry: false })
}
