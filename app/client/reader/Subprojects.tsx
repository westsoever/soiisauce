// app/client/reader/Subprojects.tsx
// A project note's place in a bigger project (D127): a trail of its parents above the title,
// and on the parent a list of its subprojects with status and progress, as the board shows them.
import { Fragment } from 'react'
import { progressOf } from '../../lib/board'
import { formatDate } from '../../lib/format'
import { notePath } from '../../lib/paths'
import { asText } from '../../lib/read-field'
import { ancestors, doneCount, subprojectsOf } from '../../lib/subprojects'
import type { NoteMeta } from '../../lib/types'
import { useVault } from '../lib/queries'
import { navigate } from '../lib/router'
import { Badge } from '../ui/badge'
import { Progress } from '../ui/progress'

function NoteAnchor({ note, className }: { note: NoteMeta; className?: string }) {
  return (
    <a
      href={notePath(note.id)}
      onClick={e => {
        e.preventDefault()
        navigate(notePath(note.id))
      }}
      className={className}
    >
      {note.title}
    </a>
  )
}

/** "Balcony garden / Raised beds /" above the title of a subproject, outermost parent first. Nothing for a note without a parent in the vault. */
export function ParentTrail({ note }: { note: NoteMeta }) {
  const notes = useVault().data?.notes
  if (note.type !== 'project' || !notes) return null
  const { chain } = ancestors(note, notes)
  if (chain.length === 0) return null
  return (
    <nav aria-label="Parent projects" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {[...chain].reverse().map(parent => (
        <Fragment key={parent.id}>
          <NoteAnchor note={parent} className="hover:text-foreground hover:underline" />
          <span aria-hidden>/</span>
        </Fragment>
      ))}
    </nav>
  )
}

/** The subprojects of a note: open ones first, then done ones. Nothing when there are none. */
export function Subprojects({ note }: { note: NoteMeta }) {
  const notes = useVault().data?.notes
  if (!notes) return null
  const subprojects = subprojectsOf(note, notes)
  if (subprojects.length === 0) return null
  return (
    <section className="my-4">
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">
        Subprojects · {doneCount(subprojects)} of {subprojects.length} done
      </h2>
      <ul className="flex flex-col gap-0.5">
        {subprojects.map(sub => {
          const status = asText(sub.frontmatter.status)
          const due = asText(sub.frontmatter.due)
          const progress = progressOf(sub)
          return (
            <li key={sub.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
              <NoteAnchor note={sub} className="min-w-0 flex-1 truncate font-medium" />
              {due && /^\d{4}-\d{2}-\d{2}$/.test(due) && <span className="text-xs text-muted-foreground">{formatDate(due, 'short')}</span>}
              {progress !== null && (
                <span className="flex w-24 items-center gap-2">
                  <Progress value={progress} aria-label={`${progress}% done`} className="flex-1" />
                  <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{Math.round(progress)}%</span>
                </span>
              )}
              {status && <Badge variant="secondary">{status}</Badge>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
