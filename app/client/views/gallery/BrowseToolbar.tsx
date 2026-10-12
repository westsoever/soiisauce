// The Library toolbar (spec "Toolbar"): Sections and search, then a Subcategory dropdown,
// status, Has my notes, Grid/List and S/M/L. Two rows that keep their height whatever is
// filtered, so the line under them doesn't move. Sticky under the tab strip; the section
// chips scroll sideways on a phone.
import { IconLayoutGrid, IconList, IconNote, IconSearch, IconX } from '@tabler/icons-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { cn } from '../../ui/utils'
import type { BrowseLayout, BrowseResult, BrowseSize, BrowseState } from './browse'

const ALL = '\u0000all'

const SIZES: { id: BrowseSize; label: string }[] = [
  { id: 's', label: 'Small' },
  { id: 'm', label: 'Medium' },
  { id: 'l', label: 'Large' }
]

function Chip({ on, label, count, onClick }: { on: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <Button size="sm" variant={on ? 'secondary' : 'ghost'} aria-pressed={on} className="shrink-0 max-md:h-9" onClick={onClick}>
      {label}
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </Button>
  )
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex min-w-0 flex-1 gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      {children}
    </div>
  )
}

/** Typing filters as you go (URL replaced, no history); Escape clears. */
function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value)
  // Back/forward or "Clear filters" change the URL under us.
  useEffect(() => setText(value), [value])
  const set = (q: string) => {
    setText(q)
    onChange(q)
  }
  return (
    <div className="relative w-full shrink-0 md:w-64">
      <IconSearch stroke={1.75} className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="Search this tab"
        placeholder="Search title or author"
        value={text}
        className="ps-8 pe-8 max-md:h-9 [&::-webkit-search-cancel-button]:hidden"
        onChange={e => set(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape' && text) {
            e.stopPropagation()
            set('')
          }
        }}
      />
      {text && (
        <Button size="icon-xs" variant="ghost" aria-label="Clear search" className="absolute end-1.5 top-1/2 -translate-y-1/2" onClick={() => set('')}>
          <IconX stroke={1.75} />
        </Button>
      )}
    </div>
  )
}

export function BrowseToolbar({
  result,
  state,
  layout,
  onState,
  onLayout
}: {
  result: BrowseResult
  /** With unknown URL values already dropped (section/category from the result). */
  state: BrowseState
  layout: BrowseLayout
  /** replace: toggles (status, Has my notes) don't add history entries (refinement 10). */
  onState: (next: BrowseState, options?: { replace?: boolean }) => void
  onLayout: (next: BrowseLayout) => void
}) {
  return (
    // Sticky from md up only (refinement 9). z-10: covers are positioned elements later in the DOM and would paint over it.
    <div className="z-10 flex flex-col gap-1.5 border-b bg-background px-4 py-2 md:sticky md:top-0">
      <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-4">
        {result.sections.length > 0 ? (
          <ChipRow label="Sections">
            <Chip on={!state.c} label="All" count={result.total} onClick={() => onState({ ...state, c: null, cat: null })} />
            {result.sections.map(f => (
              <Chip key={f.key} on={state.c === f.key} label={f.label} count={f.count} onClick={() => onState({ ...state, c: f.key, cat: null })} />
            ))}
          </ChipRow>
        ) : (
          <div className="hidden flex-1 md:block" />
        )}
        <SearchBox value={state.q} onChange={q => onState({ ...state, q }, { replace: true })} />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {result.hasCategories && <SubcategoryPicker result={result} state={state} onState={onState} />}
        {result.statuses.length > 0 && (
          <div role="group" aria-label="Status" className="flex gap-1">
            {result.statuses.map(s => {
              const on = state.s.includes(s.id)
              return (
                <Button
                  key={s.id}
                  size="sm"
                  variant={on ? 'secondary' : 'ghost'}
                  aria-pressed={on}
                  className="max-md:h-9"
                  onClick={() => onState({ ...state, s: on ? state.s.filter(x => x !== s.id) : [...state.s, s.id] }, { replace: true })}
                >
                  {s.label}
                  <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
                </Button>
              )
            })}
          </div>
        )}
        <Button
          size="sm"
          variant={state.notes ? 'secondary' : 'ghost'}
          aria-pressed={state.notes}
          className="max-md:h-9"
          onClick={() => onState({ ...state, notes: !state.notes }, { replace: true })}
        >
          <IconNote stroke={1.75} />
          Has my notes
        </Button>
        <div className={cn('ms-auto flex gap-2')}>
          <div role="group" aria-label="Layout" className="flex">
            <Button size="icon-sm" variant={layout.view === 'grid' ? 'secondary' : 'ghost'} aria-pressed={layout.view === 'grid'} aria-label="Grid" title="Grid" className="max-md:size-9" onClick={() => onLayout({ ...layout, view: 'grid' })}>
              <IconLayoutGrid stroke={1.75} />
            </Button>
            <Button size="icon-sm" variant={layout.view === 'list' ? 'secondary' : 'ghost'} aria-pressed={layout.view === 'list'} aria-label="List" title="List" className="max-md:size-9" onClick={() => onLayout({ ...layout, view: 'list' })}>
              <IconList stroke={1.75} />
            </Button>
          </div>
          <div role="group" aria-label="Size" className="flex">
            {SIZES.map(s => (
              <Button key={s.id} size="icon-sm" variant={layout.size === s.id ? 'secondary' : 'ghost'} aria-pressed={layout.size === s.id} aria-label={s.label} title={s.label} className="text-xs max-md:size-9" onClick={() => onLayout({ ...layout, size: s.id })}>
                {s.id.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** One dropdown instead of a wall of chips (D63); counts follow the other filters. */
function SubcategoryPicker({ result, state, onState }: { result: BrowseResult; state: BrowseState; onState: (next: BrowseState) => void }) {
  const items = [
    { value: ALL, label: 'All subcategories', count: result.matching },
    ...result.subcategories.map(f => ({ value: f.key, label: f.label, count: f.count }))
  ]
  return (
    <Select
      value={state.cat ?? ALL}
      items={items}
      onValueChange={value => value && onState({ ...state, cat: value === ALL ? null : value })}
    >
      <SelectTrigger aria-label="Subcategory" size="sm" className={cn('max-w-64 max-md:h-9', state.cat && 'bg-secondary')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="max-h-96 w-72">
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
