// List layout: one row per note with fixed lanes (cover, text, category, status/rating/notes).
// S: 40px rows, no cover, one line. M: 64px with a small cover. L: 96px with the description.
import { IconNote } from '@tabler/icons-react'
import { noteCategories } from '../../../lib/collections'
import type { NoteId, NoteMeta } from '../../../lib/types'
import { Badge } from '../../ui/badge'
import { cn } from '../../ui/utils'
import { hasMyNotes, type BrowseSize } from './browse'
import { CoverImage } from './CoverImage'
import { fieldText, resolveCard, type Aspect, type GalleryOptions } from './options'
import { Stars } from './Stars'

const ROW: Record<BrowseSize, { row: string; cover: string | null }> = {
  s: { row: 'min-h-10 py-1', cover: null },
  m: { row: 'min-h-16 py-1.5', cover: 'w-9' },
  l: { row: 'min-h-24 py-2', cover: 'w-14' }
}

export function BrowseList({ notes, options, size, aspect, openNote }: { notes: NoteMeta[]; options: GalleryOptions; size: BrowseSize; aspect: Aspect; openNote: (id: NoteId) => void }) {
  return (
    <ul data-browse-list className="flex flex-col">
      {notes.map(note => {
        const card = resolveCard(note, options)
        const category = noteCategories(note).join(', ')
        const description = size === 'l' ? (fieldText(note, 'description') ?? note.excerpt) || null : null
        return (
          <li key={note.id} className="[contain-intrinsic-size:auto_4rem] [content-visibility:auto]">
            <button
              type="button"
              onClick={() => openNote(note.id)}
              className={cn('flex w-full items-center gap-3 rounded-lg px-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring', ROW[size].row)}
            >
              {ROW[size].cover && <CoverImage src={card.image} title={card.title} aspect={aspect} className={cn('shrink-0 rounded-md', ROW[size].cover)} />}
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-medium', size === 's' ? 'truncate' : 'line-clamp-2')}>{card.title}</span>
                {card.subtitle && size !== 's' && <span className="block truncate text-xs text-muted-foreground">{card.subtitle}</span>}
                {description && <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</span>}
              </span>
              <span className="hidden w-44 shrink-0 truncate text-xs text-muted-foreground md:block">{category}</span>
              <span className="flex w-20 shrink-0 flex-col items-end gap-1">
                {card.badge && <Badge variant="secondary">{card.badge}</Badge>}
                <span className="flex items-center gap-1.5">
                  {card.rating !== null && <Stars rating={card.rating} />}
                  {hasMyNotes(note) && <IconNote size={12} stroke={1.75} role="img" aria-label="Has my notes" className="text-muted-foreground" />}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
