// "Network already shows mostly the same notes": Jaccard overlap of two tabs' matched notes (spec §3).
// Used by the New view form, `soii view preview|list` and /soii-health. Pure.
import { runTab } from './query'
import type { NoteMeta, TabConfig, VaultIndex, WorkspaceConfig } from './types'

export const SIMILAR = 0.8

export function overlap(a: NoteMeta[], b: NoteMeta[]): number {
  const A = new Set(a.map(n => n.id))
  const B = new Set(b.map(n => n.id))
  const union = new Set([...A, ...B]).size
  if (union === 0) return 0
  let both = 0
  for (const id of A) if (B.has(id)) both++
  return both / union
}

export function similarTabs(
  draft: TabConfig,
  workspace: WorkspaceConfig,
  index: Pick<VaultIndex, 'notes' | 'config'>
): { tabId: string; title: string; overlap: number }[] {
  const mine = runTab(draft, index)
  return workspace.tabs
    .filter(t => t.id !== draft.id)
    .map(t => ({ tabId: t.id, title: t.title, overlap: overlap(mine, runTab(t, index)) }))
    .filter(t => t.overlap >= SIMILAR)
    .sort((a, b) => b.overlap - a.overlap)
}
