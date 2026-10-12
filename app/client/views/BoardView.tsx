// Read-only board: one column per value of options.groupBy (spec §12). The
// grouping rules live in app/lib/board.ts; this file only renders them.
import { useMemo } from 'react'
import { z } from 'zod'
import { groupNotes, progressOf } from '../../lib/board'
import { asText, readField } from '../../lib/read-field'
import type { NoteId, NoteMeta, ViewProps } from '../../lib/types'
import { Progress } from '../ui/progress'
import { cn } from '../ui/utils'
import { OptionsError } from './cells'

const BoardOptionsSchema = z.object({
  groupBy: z.string().min(1).default('status'),
  groups: z.array(z.string()).optional(),
  yearField: z.string().min(1).optional(),
  subtitle: z.string().min(1).optional()
}).strict()

export function BoardView({ tab, notes, openNote }: ViewProps) {
  const parsed = useMemo(() => BoardOptionsSchema.safeParse(tab.options ?? {}), [tab.options])
  const columns = useMemo(() => (parsed.success ? groupNotes(notes, parsed.data) : []), [notes, parsed])

  if (!parsed.success) return <OptionsError view="board" error={parsed.error} />
  // WorkspaceScreen shows the empty-tab state for zero notes (checked in Task 0).
  if (notes.length === 0) return null

  return (
    <div className="flex h-full snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto p-4 max-md:px-3 md:scroll-px-4">
      {columns.map(column => (
        <section key={column.key} className="flex w-72 shrink-0 snap-start flex-col gap-2 max-md:w-[85vw]">
          <header className="flex h-8 items-center gap-2 px-1 text-sm">
            <span className={cn('truncate font-medium', column.missing && 'text-muted-foreground')}>{column.label}</span>
            <span className="text-muted-foreground tabular-nums">{column.notes.length}</span>
          </header>
          <div className="flex flex-col gap-2 pb-2">
            {column.notes.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nothing here.</p>}
            {column.notes.map(note => (
              <BoardCard key={note.id} note={note} subtitleField={parsed.data.subtitle} onOpen={openNote} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BoardCard({ note, subtitleField, onOpen }: { note: NoteMeta; subtitleField?: string; onOpen: (id: NoteId) => void }) {
  const subtitle = subtitleField ? asText(readField(note, subtitleField)) : null
  const progress = progressOf(note)
  return (
    <button
      type="button"
      onClick={() => onOpen(note.id)}
      className="flex w-full flex-col gap-1 rounded-lg bg-card p-3 text-left shadow-xs transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="truncate text-sm font-medium">{note.title}</span>
      {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      {progress !== null && (
        <span className="mt-1 flex items-center gap-2">
          <Progress value={progress} aria-label={`${progress}% done`} className="flex-1" />
          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{Math.round(progress)}%</span>
        </span>
      )}
    </button>
  )
}
