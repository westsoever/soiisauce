// Library gallery (spec §11): a cover grid, 2 columns on phones up to 6 on wide
// screens, optional groupBy sections, and the typographic tile fallback. Library
// workspace tabs hand over to LibraryBrowse (sections, subcategories, filters, layouts).
import type { ViewProps } from '../../lib/types'
import { OptionsError } from './cells'
import { GalleryCard } from './gallery/GalleryCard'
import { LibraryBrowse } from './gallery/LibraryBrowse'
import { groupNotes, parseGalleryOptions, resolveCard, tabAspect, type GalleryOptions, type NoteGroup } from './gallery/options'

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'

export function GalleryView({ workspace, tab, notes, openNote }: ViewProps) {
  const parsed = parseGalleryOptions(tab.options)
  if (!parsed.ok) return <OptionsError view="gallery" error={parsed.error} />
  const options: GalleryOptions = parsed.options
  // Library tabs browse by section/subcategory (see the library browse design notes).
  if (workspace.id === 'library') return <LibraryBrowse workspaceId={workspace.id} tabId={tab.id} notes={notes} options={options} openNote={openNote} />
  const aspect = tabAspect(options, notes)
  const groups: NoteGroup[] = options.groupBy ? groupNotes(notes, options.groupBy) : [{ key: '*', label: '', notes }]

  return (
    <div className="flex flex-col gap-6 p-4">
      {groups.map(group => (
        <section key={group.key} className="flex flex-col gap-3">
          {options.groupBy && (
            <h2 className="flex items-baseline gap-2 text-sm font-medium">
              <span className="capitalize">{group.label}</span>
              <span className="text-muted-foreground tabular-nums">{group.notes.length}</span>
            </h2>
          )}
          <div className={GRID}>
            {group.notes.map(note => (
              <GalleryCard key={note.id} card={resolveCard(note, options)} aspect={aspect} onOpen={() => openNote(note.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default GalleryView
