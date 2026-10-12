// app/client/log/TargetPicker.tsx
// "Which one?": search this kind's notes (all notes for Log → Note), or start a new one.
// A new one is hidden when a note with exactly that name exists, to avoid duplicates.
import { IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { creatingKind, type LogKind } from '../../lib/log'
import type { NoteMeta } from '../../lib/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import type { LogTarget } from './draft'
import { candidatesFor, detailFor, fold } from './match'

export function TargetPicker({ kind, notes, target, onChange }: { kind: LogKind; notes: NoteMeta[]; target: LogTarget | null; onChange: (target: LogTarget | null) => void }) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => candidatesFor(kind, notes, query), [kind, notes, query])
  const creates = creatingKind(kind)

  if (target) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium md:text-sm">{target.mode === 'new' ? `New: ${target.title}` : target.title}</div>
          {target.mode === 'new' && <div className="text-xs text-muted-foreground">Creates a new {creates.label.toLowerCase()} note</div>}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    )
  }

  const typed = query.replace(/\s+/g, ' ').trim()
  const exact = typed !== '' && matches.some(n => fold(n.title) === fold(typed))
  const placeholder = kind.type === 'person' ? 'Search people…' : kind.type ? `Search ${kind.label.toLowerCase()}s…` : 'Search the vault…'
  return (
    <div className="grid gap-1">
      <Input aria-label="Search" className="h-11 md:h-8" placeholder={placeholder} value={query} onChange={e => setQuery(e.target.value)} />
      <ul className="grid">
        {matches.map(n => {
          const detail = detailFor(n)
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onChange({ mode: 'append', path: n.path, title: n.title })}
                className="flex min-h-11 w-full flex-col justify-center rounded-lg px-3 py-1.5 text-left hover:bg-accent active:bg-accent"
              >
                <span className="truncate text-base md:text-sm">{n.title}</span>
                {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
              </button>
            </li>
          )
        })}
        {creates.folder && typed && !exact && (
          <li>
            <button
              type="button"
              onClick={() => onChange({ mode: 'new', title: typed })}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-base font-medium hover:bg-accent md:text-sm"
            >
              <IconPlus size={16} stroke={1.75} />
              New {creates.label.toLowerCase()} “{typed}”
            </button>
          </li>
        )}
        {matches.length === 0 && !typed && <li className="px-3 py-2 text-sm text-muted-foreground">Nothing yet. Type a name to start one.</li>}
      </ul>
    </div>
  )
}
