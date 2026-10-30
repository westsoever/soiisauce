// Board: one column per value of options.groupBy (spec §12). The grouping, filter and
// move rules live in app/lib/board.ts; this file renders them. With `move: true` and a
// vault soii can write to, cards move by drag and drop or their "Move to" menu, and
// each move writes the grouped field (and a `stamp` date) into the note (D126).
import { useQueryClient } from '@tanstack/react-query'
import { IconAlertTriangle, IconArrowsMove } from '@tabler/icons-react'
import { useMemo, useState, type DragEvent } from 'react'
import { z } from 'zod'
import {
  boardFacets,
  boardSearch,
  filterBoard,
  groupNotes,
  isFlagged,
  linkValue,
  moveEdits,
  parseBoardSearch,
  progressOf,
  stampedDate,
  type BoardColumn,
  type BoardFacet,
  type BoardFilterState
} from '../../lib/board'
import { formatDate } from '../../lib/format'
import { localDay } from '../../lib/log'
import { notePath } from '../../lib/paths'
import { asText, readField } from '../../lib/read-field'
import { doneCount, findNote, parentOf, subprojectMap } from '../../lib/subprojects'
import type { NoteId, NoteMeta, ViewProps } from '../../lib/types'
import { useCapabilities } from '../lib/queries'
import { navigate, useLocationSearch } from '../lib/router'
import { toast } from '../lib/toast'
import { builtAt, waitForRebuild } from '../lib/use-fresh-vault'
import { postProperty } from '../reader/PropertyEditor'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Progress } from '../ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { cn } from '../ui/utils'
import { labelFor, OptionsError } from './cells'

const Field = z.string().min(1)

const BoardOptionsSchema = z.object({
  groupBy: Field.default('status'),
  groups: z.array(z.string()).optional(),
  yearField: Field.optional(),
  subtitle: Field.optional(),
  fallback: Field.optional(),
  badges: z.array(Field).optional(),
  flag: Field.optional(),
  links: z.array(Field).optional(),
  filters: z.array(z.union([Field.transform(field => ({ field })), z.object({ field: Field, none: Field.optional() }).strict()])).optional(),
  move: z.boolean().optional(),
  stamp: z.record(Field, Field).optional()
}).strict()

type BoardOptions = z.infer<typeof BoardOptionsSchema>

const DRAG_TYPE = 'application/x-soii-note'
const ALL = '\u0000all'
const NONE = '\u0000none'
const NO_FILTERS: { field: string; none?: string }[] = []

export function BoardView({ tab, notes, index, openNote }: ViewProps) {
  const parsed = useMemo(() => BoardOptionsSchema.safeParse(tab.options ?? {}), [tab.options])
  const capabilities = useCapabilities()
  const search = useLocationSearch()
  const queryClient = useQueryClient()
  // Note id → the column it is being moved to, while the save runs.
  const [moving, setMoving] = useState<Record<NoteId, string>>({})
  const [over, setOver] = useState<string | null>(null)

  const options = parsed.success ? parsed.data : null
  const filters = options?.filters ?? NO_FILTERS
  const state = useMemo(() => parseBoardSearch(search, filters, options?.flag), [search, filters, options?.flag])
  const movable = !!options?.move && options.groupBy !== 'year' && capabilities.data?.write === true

  // A subproject's card names its parent, and a parent's card counts its subprojects (D127).
  const subprojects = useMemo(() => subprojectMap(index.notes), [index.notes])
  const facets = useMemo(() => (options ? boardFacets(notes, filters, state.values, state.flag, options.flag) : null), [notes, filters, state, options])
  const columns = useMemo(() => {
    if (!options) return []
    const shown = filterBoard(notes, state.values, state.flag, options.flag).map(note =>
      moving[note.id] ? { ...note, frontmatter: { ...note.frontmatter, [options.groupBy]: moving[note.id] } } : note
    )
    return groupNotes(shown, options)
  }, [notes, state, options, moving])

  if (!parsed.success || !options) return <OptionsError view="board" error={parsed.error!} />
  // WorkspaceScreen shows the empty-tab state for zero notes (checked in Task 0).
  if (notes.length === 0) return null

  const setState = (next: BoardFilterState) => navigate(`${location.pathname}${boardSearch(next, filters, options.flag)}`, { replace: true })

  const move = async (note: NoteMeta, to: string) => {
    const edits = moveEdits(note, to, options, localDay())
    if (edits.length === 0 || moving[note.id]) return
    setMoving(m => ({ ...m, [note.id]: to }))
    try {
      const before = await builtAt()
      let warning: string | null = null
      for (const edit of edits) warning = (await postProperty(queryClient, note, edit.key, edit.value)).warning ?? warning
      const extra = warning && !warning.startsWith('Committed') ? ` ${warning}` : ''
      toast(`Moved "${note.title}" to ${to}.${extra}`, extra ? 'info' : 'success')
      void waitForRebuild(queryClient, before)
    } catch (err) {
      toast(err instanceof Error ? err.message : `Couldn't move "${note.title}".`, 'error')
    } finally {
      setMoving(({ [note.id]: _, ...rest }) => rest)
    }
  }

  const targets = columns.filter(c => !c.missing)
  const dropProps = (column: BoardColumn) => {
    if (!movable || column.missing) return {}
    const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE)
    return {
      onDragOver: (e: DragEvent) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (over !== column.key) setOver(column.key)
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
      },
      onDrop: (e: DragEvent) => {
        setOver(null)
        const note = notes.find(n => n.id === e.dataTransfer.getData(DRAG_TYPE))
        if (!note) return
        e.preventDefault()
        void move(note, column.label)
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      {facets && (facets.filters.length > 0 || options.flag) && (
        <BoardToolbar facets={facets.filters} flagField={options.flag} flagCount={facets.flagCount} state={state} onState={setState} />
      )}
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto p-4 max-md:px-3 md:scroll-px-4">
        {columns.map(column => (
          <section
            key={column.key}
            aria-label={column.label}
            className={cn('flex w-72 shrink-0 snap-start flex-col gap-2 rounded-lg transition-colors max-md:w-[85vw]', over === column.key && 'bg-accent')}
            {...dropProps(column)}
          >
            <header className="flex h-8 shrink-0 items-center gap-2 px-1 text-sm">
              <span className={cn('truncate font-medium', column.missing && 'text-muted-foreground')}>{column.label}</span>
              <span className="text-muted-foreground tabular-nums">{column.notes.length}</span>
            </header>
            <div className="flex flex-col gap-2 pb-2">
              {column.notes.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nothing here.</p>}
              {column.notes.map(note => (
                <BoardCard
                  key={note.id}
                  note={note}
                  column={column.label}
                  options={options}
                  notes={index.notes}
                  subprojects={subprojects}
                  pending={!!moving[note.id]}
                  targets={movable ? targets.filter(t => t.key !== column.key).map(t => t.label) : null}
                  onMove={to => void move(note, to)}
                  onOpen={openNote}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

// `pr` → "PR": two-letter field names are initialisms.
const fieldLabel = (field: string) => (field.length <= 2 ? field.toUpperCase() : labelFor(field))

function BoardCard({
  note,
  column,
  options,
  notes,
  subprojects,
  pending,
  targets,
  onMove,
  onOpen
}: {
  note: NoteMeta
  column: string
  options: BoardOptions
  notes: NoteMeta[]
  subprojects: Map<NoteId, NoteMeta[]>
  pending: boolean
  /** Columns it can move to; null when the board can't move cards. */
  targets: string[] | null
  onMove: (to: string) => void
  onOpen: (id: NoteId) => void
}) {
  const subtitle = options.subtitle ? asText(readField(note, options.subtitle)) : null
  const badges = (options.badges ?? []).map(field => asText(readField(note, field))).filter((b): b is string => b !== null)
  const flag = options.flag && isFlagged(note, options.flag) ? asText(readField(note, options.flag)) : null
  const stamped = stampedDate(note, column, options.stamp)
  const links = (options.links ?? []).flatMap(field => {
    const link = linkValue(readField(note, field), fieldLabel(field))
    return link ? [{ field, link }] : []
  })
  const progress = progressOf(note)
  const movable = targets !== null && !pending

  return (
    <article
      draggable={movable}
      aria-busy={pending}
      onDragStart={e => {
        e.dataTransfer.setData(DRAG_TYPE, note.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn('relative flex flex-col gap-1.5 rounded-lg bg-card p-3 shadow-xs transition-colors hover:bg-accent', pending && 'opacity-60')}
    >
      <div className="flex items-start gap-2">
        {/* The title's ::after covers the card, so a click anywhere opens the note; links and the menu sit above it. */}
        <button
          type="button"
          onClick={() => onOpen(note.id)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        >
          {note.title}
        </button>
        {targets !== null && targets.length > 0 && <MoveMenu title={note.title} targets={targets} disabled={pending} onMove={onMove} />}
      </div>
      <ProjectFamily note={note} notes={notes} subprojects={subprojects} />
      {(subtitle || badges.length > 0) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
          {badges.map((badge, i) => (
            <Badge key={`${i}-${badge}`} variant="secondary">
              {badge}
            </Badge>
          ))}
        </div>
      )}
      {flag && options.flag && (
        <p className="flex items-start gap-1 text-xs text-destructive">
          <IconAlertTriangle size={12} stroke={1.75} className="mt-0.5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">
            {labelFor(options.flag)}: {flag}
          </span>
        </p>
      )}
      {stamped && (
        <span className="text-xs text-muted-foreground">
          {labelFor(column)} {formatDate(stamped, 'short')}
        </span>
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {links.map(({ field, link }) => (
            <CardLink key={field} link={link} notes={notes} />
          ))}
        </div>
      )}
      {progress !== null && (
        <span className="mt-1 flex items-center gap-2">
          <Progress value={progress} aria-label={`${progress}% done`} className="flex-1" />
          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{Math.round(progress)}%</span>
        </span>
      )}
    </article>
  )
}

/** A project card's place in a bigger project: "↳ Parent" linking to it, and "2 of 3 subprojects done" on the parent (D127). */
export function ProjectFamily({ note, notes, subprojects }: { note: NoteMeta; notes: NoteMeta[]; subprojects: Map<NoteId, NoteMeta[]> }) {
  const parent = note.type === 'project' ? parentOf(note, notes) : undefined
  const children = subprojects.get(note.id)
  if (!parent && !children) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {parent && parent.id !== note.id && <CardLink link={{ kind: 'note', target: parent.id, label: `↳ ${parent.title}` }} notes={notes} />}
      {children && (
        <span className="text-muted-foreground">
          {doneCount(children)} of {children.length} {children.length === 1 ? 'subproject' : 'subprojects'} done
        </span>
      )}
    </div>
  )
}

function CardLink({ link, notes }: { link: NonNullable<ReturnType<typeof linkValue>>; notes: NoteMeta[] }) {
  const linkClass = 'relative underline underline-offset-2 hover:text-foreground'
  if (link.kind === 'url') {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, 'text-muted-foreground')}>
        {link.label}
      </a>
    )
  }
  if (link.kind === 'note') {
    const target = findNote(notes, link.target)
    if (!target) return <span className="text-muted-foreground">{link.label ?? link.target}</span>
    return (
      <a
        href={notePath(target.id)}
        onClick={e => {
          e.preventDefault()
          navigate(notePath(target.id))
        }}
        className={cn(linkClass, 'text-muted-foreground')}
      >
        {link.label ?? target.title}
      </a>
    )
  }
  return <span className="text-muted-foreground">{link.label}</span>
}

function MoveMenu({ title, targets, disabled, onMove }: { title: string; targets: string[]; disabled: boolean; onMove: (to: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={<Button size="icon-xs" variant="ghost" aria-label={`Move "${title}"`} title="Move to" className="relative -my-0.5 -me-1 shrink-0 max-md:size-8" />}
      >
        <IconArrowsMove stroke={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {targets.map(target => (
            <DropdownMenuItem key={target} className="min-h-11 md:min-h-8" onClick={() => onMove(target)}>
              {target}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Chip({ on, label, count, onClick }: { on: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <Button size="sm" variant={on ? 'secondary' : 'ghost'} aria-pressed={on} className="shrink-0 max-md:h-9" onClick={onClick}>
      {label}
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </Button>
  )
}

/** One dropdown per filter field, then quick chips: each filter's "none" choice (Needs triage) and the flag (Blocked). */
function BoardToolbar({
  facets,
  flagField,
  flagCount,
  state,
  onState
}: {
  facets: BoardFacet[]
  flagField?: string
  flagCount: number
  state: BoardFilterState
  onState: (next: BoardFilterState) => void
}) {
  const setValue = (field: string, value: string | null | undefined) => {
    const { [field]: _, ...rest } = state.values
    onState({ ...state, values: value === undefined ? rest : { ...rest, [field]: value } })
  }
  const active = Object.keys(state.values).length > 0 || state.flag
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-4 pt-3 [scrollbar-width:none] max-md:px-3 md:flex-wrap md:overflow-visible">
      {facets.map(facet => (
        <FacetPicker key={facet.field} facet={facet} value={state.values[facet.field]} onValue={value => setValue(facet.field, value)} />
      ))}
      {facets.map(facet =>
        facet.noneLabel ? (
          <Chip
            key={facet.field}
            on={state.values[facet.field] === null}
            label={facet.noneLabel}
            count={facet.noneCount}
            onClick={() => setValue(facet.field, state.values[facet.field] === null ? undefined : null)}
          />
        ) : null
      )}
      {flagField && <Chip on={state.flag} label={labelFor(flagField)} count={flagCount} onClick={() => onState({ ...state, flag: !state.flag })} />}
      {active && (
        <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground max-md:h-9" onClick={() => onState({ values: {}, flag: false })}>
          Clear filters
        </Button>
      )}
    </div>
  )
}

/** Any / each value / none, with counts under the other filters. */
function FacetPicker({ facet, value, onValue }: { facet: BoardFacet; value: string | null | undefined; onValue: (value: string | null | undefined) => void }) {
  const label = labelFor(facet.field)
  const items = [
    { value: ALL, label: `Any ${label.toLowerCase()}`, count: facet.total },
    ...facet.values.map(v => ({ value: v.key, label: v.label, count: v.count })),
    { value: NONE, label: facet.noneLabel ?? `No ${label.toLowerCase()}`, count: facet.noneCount }
  ]
  const current = value === undefined ? ALL : value === null ? NONE : value.trim().toLowerCase()
  return (
    <Select
      value={items.some(i => i.value === current) ? current : ALL}
      items={items}
      onValueChange={next => {
        if (next === null || next === undefined) return
        onValue(next === ALL ? undefined : next === NONE ? null : next)
      }}
    >
      <SelectTrigger aria-label={label} size="sm" className={cn('max-w-48 shrink-0 max-md:h-9', value !== undefined && 'bg-secondary')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="max-h-96 w-56">
        {items.map(item => (
          // Single choice: no tick column; the chosen one is highlighted instead.
          <SelectItem key={item.value} value={item.value} className="pe-1.5 data-selected:bg-secondary data-selected:font-medium [&>span.absolute]:hidden">
            <span className="flex-1 truncate">{item.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
