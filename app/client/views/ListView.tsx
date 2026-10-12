// app/client/views/ListView.tsx
// The list view (spec §9): title, optional subtitle field (else the excerpt), tags, date.
import { z } from 'zod'
import { formatDate } from '../../lib/format'
import { getField } from '../../lib/query'
import type { ViewProps } from '../../lib/types'
import { Badge } from '../ui/badge'
import { displayValue, OptionsError } from './cells'

const optionsSchema = z.object({ subtitle: z.string().optional() }).strict()

export function ListView({ tab, notes, openNote }: ViewProps) {
  const parsed = optionsSchema.safeParse(tab.options ?? {})
  if (!parsed.success) return <OptionsError view="list" error={parsed.error} />
  const subtitleField = parsed.data.subtitle
  return (
    <ul className="mx-auto flex max-w-3xl flex-col py-2">
      {notes.map(note => {
        const sub = subtitleField ? getField(note, subtitleField) : null
        const line = sub !== null && sub !== undefined && sub !== '' ? displayValue(sub) : note.excerpt
        return (
          <li key={note.id}>
            <button type="button" onClick={() => openNote(note.id)} className="flex w-full items-baseline gap-3 rounded-lg px-4 py-2.5 text-left hover:bg-accent">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{note.title}</span>
                {line && <span className="block truncate text-xs text-muted-foreground">{line}</span>}
              </span>
              {note.tags.length > 0 && (
                <span className="hidden shrink-0 gap-1 sm:flex">
                  {note.tags.slice(0, 3).map(t => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </span>
              )}
              {note.date && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(note.date, 'short')}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
