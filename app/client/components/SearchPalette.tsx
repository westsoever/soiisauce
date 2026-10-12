// app/client/components/SearchPalette.tsx
// ⌘K / Ctrl-K search over the vault (GET /api/search). openSearch() opens it
// from anywhere (sidebar row, mobile header button).
import { IconSearch } from '@tabler/icons-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { notePath } from '../../lib/paths'
import { useSearch } from '../lib/queries'
import { navigate } from '../lib/router'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { cn } from '../ui/utils'

let open = false
const listeners = new Set<() => void>()

function setOpen(next: boolean): void {
  open = next
  for (const l of listeners) l()
}

export function openSearch(): void {
  setOpen(true)
}

function useOpen(): boolean {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => open
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [current, setCurrent] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setCurrent(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return current
}

export function SearchPalette() {
  const isOpen = useOpen()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const debounced = useDebounced(q, 150)
  const search = useSearch(debounced)
  const results = search.data ?? []

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setActive(0), [debounced])

  const go = (id: string) => {
    setOpen(false)
    setQ('')
    navigate(notePath(id))
  }

  return (
    <Dialog open={isOpen} onOpenChange={next => setOpen(next)}>
      <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Search the vault</DialogTitle>
        <div className="flex items-center gap-2 px-3 shadow-[0_1px_0_var(--border)]">
          <IconSearch size={16} stroke={1.75} className="text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive(a => Math.min(a + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive(a => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && results[active]) {
                e.preventDefault()
                go(results[active].id)
              }
            }}
            id="search-notes"
            name="q"
            placeholder="Search notes"
            aria-label="Search notes"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {debounced.trim() && search.isFetched && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notes match “{debounced.trim()}”.</p>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.id)}
              className={cn('flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left', i === active && 'bg-accent')}
            >
              <span className="truncate text-sm font-medium">{r.title}</span>
              <span className="truncate text-xs text-muted-foreground">{r.path}</span>
              {r.snippet && <span className="line-clamp-2 text-xs text-muted-foreground">{r.snippet}</span>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
