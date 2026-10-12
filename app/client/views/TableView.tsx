// app/client/views/TableView.tsx
// The table view (spec §9): configurable columns with formats; clicking a
// header sorts client-side (asc → desc → config order). Stacks into rows below md.
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react'
import { Fragment, useMemo, useState } from 'react'
import { z } from 'zod'
import { sortNotes } from '../../lib/query'
import type { SortKey, ViewProps } from '../../lib/types'
import { cn } from '../ui/utils'
import { Cell, columnSchema, hasValue, OptionsError, toColumn } from './cells'

const optionsSchema = z.object({ columns: z.array(columnSchema).min(1).optional() }).strict()
const DEFAULT_COLUMNS = ['title', 'date', 'tags']

function nextSort(current: SortKey | null, field: string): SortKey | null {
  if (!current || current.field !== field) return { field, dir: 'asc' }
  return current.dir === 'asc' ? { field, dir: 'desc' } : null
}

export function TableView({ tab, notes, openNote }: ViewProps) {
  const [sort, setSort] = useState<SortKey | null>(null)
  const parsed = useMemo(() => optionsSchema.safeParse(tab.options ?? {}), [tab.options])
  const columns = useMemo(() => ((parsed.success && parsed.data.columns) || DEFAULT_COLUMNS).map(toColumn), [parsed])
  const rows = useMemo(() => (sort ? sortNotes(notes, [sort]) : notes), [notes, sort])
  if (!parsed.success) return <OptionsError view="table" error={parsed.error} />

  const details = columns.filter(c => c.field !== 'title')
  return (
    <>
      {/* Below md: one row per note, the title on top and the other columns as one muted line. */}
      <div className="md:hidden">
        {rows.map(note => {
          const filled = details.filter(c => hasValue(note, c))
          return (
            <div
              key={note.id}
              role="button"
              tabIndex={0}
              onClick={() => openNote(note.id)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openNote(note.id))}
              className="flex min-h-14 cursor-pointer flex-col justify-center gap-0.5 px-4 py-2.5 shadow-[0_-1px_0_var(--border)] active:bg-accent"
            >
              <span className="text-base font-medium">{note.title}</span>
              {filled.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {filled.map((c, i) => (
                    <Fragment key={c.field}>
                      {i > 0 && ' · '}
                      <Cell note={note} column={c} />
                    </Fragment>
                  ))}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full min-w-max text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              {columns.map(col => (
                <th key={col.field} className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort(s => nextSort(s, col.field))}>
                    {col.label}
                    {sort?.field === col.field && (sort.dir === 'asc' ? <IconArrowUp size={12} stroke={1.75} /> : <IconArrowDown size={12} stroke={1.75} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(note => (
              <tr key={note.id} onClick={() => openNote(note.id)} className="cursor-pointer shadow-[0_-1px_0_var(--border)] hover:bg-accent">
                {columns.map((col, i) => (
                  <td key={col.field} className={cn('h-10 px-4', i === 0 && 'font-medium')}>
                    {col.field === 'title' ? (
                      <button type="button" className="text-left" onClick={e => (e.stopPropagation(), openNote(note.id))}>
                        {note.title}
                      </button>
                    ) : (
                      <Cell note={note} column={col} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
