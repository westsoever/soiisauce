// app/client/vault/VaultPage.tsx
// /vault: folder tree beside the 30 most recent notes on desktop; the tree
// collapses above the list on mobile (spec §9).
import { useMemo, useState } from 'react'
import { formatDate } from '../../lib/format'
import { notePath } from '../../lib/paths'
import type { NoteMeta, VaultIndex } from '../../lib/types'
import { navigate } from '../lib/router'
import { BuildWarnings } from './BuildWarnings'
import { FolderTree } from './FolderTree'

export function recentNotes(notes: NoteMeta[], n = 30): NoteMeta[] {
  const when = (note: NoteMeta) => note.updated ?? note.date ?? ''
  return notes
    .filter(note => when(note))
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, n)
}

export function VaultPage({ index }: { index: VaultIndex }) {
  const recent = useMemo(() => recentNotes(index.notes), [index.notes])
  const [treeOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-2 md:h-12 md:px-3">
        <h1 className="px-2 text-base font-medium md:text-sm">Vault</h1>
        <span className="text-xs text-muted-foreground tabular-nums">{index.notes.length} notes</span>
      </header>
      <main className="min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
        <div className="grid gap-6 p-4 md:grid-cols-[minmax(14rem,20rem)_1fr] md:p-6">
          <details open={treeOpen} className="group md:open:block">
            <summary className="mb-2 cursor-pointer text-xs font-medium text-muted-foreground md:pointer-events-none md:list-none">Folders</summary>
            <FolderTree root={index.folders} notes={index.notes} />
          </details>
          <section aria-label="Recent notes">
            <h2 className="mb-2 text-xs font-medium text-muted-foreground">Recent</h2>
            {recent.length === 0 && <p className="text-sm text-muted-foreground">No dated notes yet.</p>}
            <ul className="flex flex-col gap-0.5">
              {recent.map(note => (
                <li key={note.id}>
                  <a
                    href={notePath(note.id)}
                    onClick={e => {
                      e.preventDefault()
                      navigate(notePath(note.id))
                    }}
                    className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{note.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(note.updated ?? note.date ?? '', 'short')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <BuildWarnings warnings={index.warnings} builtAt={index.builtAt} vaultCommit={index.vaultCommit} />
      </main>
    </div>
  )
}
