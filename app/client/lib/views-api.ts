// app/client/lib/views-api.ts
// The app's calls to /api/views (D101). After a write, wait for the rebuild so the new or changed
// tab is in the index before we navigate to it.
import type { QueryClient } from '@tanstack/react-query'
import type { Query, SortKey } from '../../lib/types'
import type { TabDraft } from '../../lib/view-edit'
import { api } from './http'
import { waitForRebuild } from './use-fresh-vault'

export interface ViewWriteResult {
  workspace: string
  tabId: string
  title: string
  warning: string | null
}

const viewPath = (workspace: string, tabId: string) => `/api/views/${encodeURIComponent(workspace)}/${encodeURIComponent(tabId)}`

export const addView = (workspace: string, tab: TabDraft) => api<ViewWriteResult>('/api/views', { method: 'POST', body: { workspace, tab } })
export const updateView = (workspace: string, tabId: string, change: { query?: Query; sort?: SortKey[] }) =>
  api<ViewWriteResult>(viewPath(workspace, tabId), { method: 'PATCH', body: change })
export const removeView = (workspace: string, tabId: string) => api<ViewWriteResult>(viewPath(workspace, tabId), { method: 'DELETE' })

export async function afterViewWrite(queryClient: QueryClient, before: string | null): Promise<void> {
  await waitForRebuild(queryClient, before)
}
