// app/client/vault/FolderTree.tsx
// The vault's folders and notes, expand/collapse remembered per browser (spec §9).
import { IconChevronRight, IconFileText, IconFolder, IconTex } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { notePath } from '../../lib/paths'
import type { FolderNode, NoteMeta } from '../../lib/types'
import { navigate } from '../lib/router'
import { readJson, storageKeys, writeJson } from '../lib/storage'
import { cn } from '../ui/utils'

export function countNotes(node: FolderNode): number {
  return node.notes.length + node.folders.reduce((sum, f) => sum + countNotes(f), 0)
}

interface Shared {
  open: string[]
  toggle: (path: string) => void
  titles: Map<string, string>
  tex: Set<string>
}

function Children({ node, depth, shared }: { node: FolderNode; depth: number; shared: Shared }) {
  const indent = { paddingLeft: 8 + depth * 14 }
  return (
    <>
      {node.folders.map(folder => {
        const isOpen = shared.open.includes(folder.path)
        return (
          <li key={folder.path}>
            <button type="button" aria-expanded={isOpen} onClick={() => shared.toggle(folder.path)} style={indent} className="flex h-8 w-full items-center gap-1.5 rounded-lg pr-2 text-left hover:bg-accent">
              <IconChevronRight size={12} stroke={1.75} className={cn('shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
              <IconFolder size={16} stroke={1.75} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{folder.name}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{countNotes(folder)}</span>
            </button>
            {isOpen && (
              <ul>
                <Children node={folder} depth={depth + 1} shared={shared} />
              </ul>
            )}
          </li>
        )
      })}
      {node.notes.map(id => (
        <li key={id}>
          <a
            href={notePath(id)}
            onClick={e => {
              e.preventDefault()
              navigate(notePath(id))
            }}
            style={{ paddingLeft: 8 + depth * 14 + 18 }}
            className="flex h-8 items-center gap-1.5 rounded-lg pr-2 hover:bg-accent"
          >
            {shared.tex.has(id) ? (
              <IconTex size={16} stroke={1.75} className="shrink-0 text-muted-foreground" />
            ) : (
              <IconFileText size={16} stroke={1.75} className="shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{shared.titles.get(id) ?? id}</span>
          </a>
        </li>
      ))}
    </>
  )
}

export function FolderTree({ root, notes }: { root: FolderNode; notes: NoteMeta[] }) {
  const titles = useMemo(() => new Map(notes.map(n => [n.id, n.title])), [notes])
  const tex = useMemo(() => new Set(notes.filter(n => n.format === 'tex').map(n => n.id)), [notes])
  const [open, setOpen] = useState<string[]>(() => readJson<string[]>(storageKeys.openFolders, []))
  const toggle = (path: string) =>
    setOpen(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      writeJson(storageKeys.openFolders, next)
      return next
    })
  return (
    <ul className="flex flex-col text-sm">
      <Children node={root} depth={0} shared={{ open, toggle, titles, tex }} />
    </ul>
  )
}
