// A Library gallery tab with the browse toolbar. Filters live in the URL (section/subcategory
// push, toggles replace); grid/list and size are remembered per tab on this device. A grouped
// view shows each group as a capped shelf with "Show all N" (plan refinement 15).
import { useMemo, useRef, useState } from 'react'
import type { NoteId, NoteMeta } from '../../../lib/types'
import { navigate, useLocationSearch } from '../../lib/router'
import { readJson, storageKeys, writeJson } from '../../lib/storage'
import { Button } from '../../ui/button'
import { cn } from '../../ui/utils'
import { browse, browseSearch, EMPTY_BROWSE, GRID_COLUMNS, hasMyNotes, parseBrowse, parseLayout, shelf, showAll, type BrowseLayout, type BrowseState } from './browse'
import { BrowseList } from './BrowseList'
import { BrowseToolbar } from './BrowseToolbar'
import { GalleryCard } from './GalleryCard'
import { majorityType, resolveCard, tabAspect, type GalleryOptions } from './options'

export function LibraryBrowse({
  workspaceId,
  tabId,
  notes,
  options,
  openNote
}: {
  workspaceId: string
  tabId: string
  notes: NoteMeta[]
  options: GalleryOptions
  openNote: (id: NoteId) => void
}) {
  const search = useLocationSearch()
  const state = useMemo(() => parseBrowse(search), [search])
  const type = useMemo(() => majorityType(notes), [notes])
  const result = useMemo(() => browse(notes, state, type), [notes, state, type])
  const aspect = useMemo(() => tabAspect(options, notes), [options, notes])
  const layoutKey = storageKeys.browseLayout(workspaceId, tabId)
  const [layout, setLayout] = useState<BrowseLayout>(() => parseLayout(readJson<unknown>(layoutKey, null)))
  const top = useRef<HTMLDivElement>(null)

  const changeLayout = (next: BrowseLayout) => {
    setLayout(next)
    writeJson(layoutKey, next)
  }
  const changeState = (next: BrowseState, opts: { replace?: boolean } = {}) => {
    navigate(`${location.pathname}${browseSearch(next)}`, opts)
    // The scroller is WorkspaceScreen's <main>; start the new view at its top.
    top.current?.closest('main')?.scrollTo({ top: 0 })
  }
  const effective: BrowseState = { ...state, c: result.section, cat: result.category }

  return (
    <div ref={top} className="flex flex-col">
      <BrowseToolbar result={result} state={effective} layout={layout} onState={changeState} onLayout={changeLayout} />
      {result.groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-muted-foreground">
          <p>Nothing matches these filters.</p>
          <Button variant="outline" size="sm" onClick={() => changeState({ ...EMPTY_BROWSE, c: result.section })}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-4">
          {result.groups.map(group => {
            const { notes: visible, hidden } = shelf(group, result.grouped, layout)
            return (
              <section key={group.key || '-'} className="flex flex-col gap-3">
                {result.grouped && (
                  <h2 className="flex items-baseline gap-2 text-sm font-medium">
                    <span>{group.label}</span>
                    <span className="text-muted-foreground tabular-nums">{group.notes.length}</span>
                  </h2>
                )}
                {layout.view === 'grid' ? (
                  <div data-browse-grid className={cn('grid gap-3', GRID_COLUMNS[layout.size])}>
                    {visible.map(note => (
                      <GalleryCard
                        key={note.id}
                        className="[contain-intrinsic-size:auto_20rem] [content-visibility:auto]"
                        card={resolveCard(note, options)}
                        aspect={aspect}
                        noted={hasMyNotes(note)}
                        onOpen={() => openNote(note.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <BrowseList notes={visible} options={options} size={layout.size} aspect={aspect} openNote={openNote} />
                )}
                {hidden > 0 && (
                  <Button variant="outline" size="sm" className="self-start" onClick={() => changeState(showAll(effective, result, group))}>
                    Show all {group.notes.length}
                  </Button>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
