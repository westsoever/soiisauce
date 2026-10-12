// One note of the selected feed day, rendered in full with the reader's body
// component. With several notes in a day, each shows its title and Open note; with one,
// Open note sits beside the day heading in FeedNav instead. content-visibility keeps very long briefs cheap to lay out.
import type { NoteId, NoteMeta } from '../../../lib/types'
import { useNote } from '../../lib/queries'
import { NoteBody } from '../../reader/NoteBody'
import { Skeleton } from '../../ui/skeleton'
import { OpenNoteLink } from './OpenNoteLink'

type Props = { note: NoteMeta; showTitle: boolean; openNote: (id: NoteId) => void }

export function FeedEntry({ note, showTitle, openNote }: Props) {
  const doc = useNote(note.id)
  return (
    <article className="[contain-intrinsic-size:auto_800px] [content-visibility:auto]">
      {showTitle && (
        <div className="mb-3 flex items-baseline gap-3">
          <h3 className="min-w-0 truncate font-medium">{note.title}</h3>
          <OpenNoteLink onClick={() => openNote(note.id)} />
        </div>
      )}
      {doc.isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
      {doc.isError && <p className="text-sm text-muted-foreground">Couldn't load this note. {doc.error.message}</p>}
      {doc.data && <NoteBody doc={doc.data} />}
    </article>
  )
}
