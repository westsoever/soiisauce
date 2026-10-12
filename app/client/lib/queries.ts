// app/client/lib/queries.ts
// Server state (TanStack Query). The vault index loads once per page view;
// a new deploy is picked up on reload (spec §17).
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { noteApiPath } from '../../lib/paths'
import type { Me, NoteDoc, NoteId, SearchResult, VaultIndex } from '../../lib/types'
import { api } from './http'

export const keys = {
  me: ['me'] as const,
  vault: ['vault'] as const,
  capabilities: ['capabilities'] as const,
  note: (id: NoteId) => ['note', id] as const,
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
