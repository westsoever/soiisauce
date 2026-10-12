// app/client/reader/Backlinks.tsx
// "Linked from" list under a note (spec §9).
import { notePath } from '../../lib/paths'
import type { NoteId } from '../../lib/types'
import { useVault } from '../lib/queries'
import { navigate } from '../lib/router'

export function Backlinks({ ids }: { ids: NoteId[] }) {
  const vault = useVault()
  if (ids.length === 0) return null
  const byId = new Map((vault.data?.notes ?? []).map(n => [n.id, n]))
  return (
    <section className="mt-10 pt-4 shadow-[0_-1px_0_var(--border)]">
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">
        Linked from {ids.length} {ids.length === 1 ? 'note' : 'notes'}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {ids.map(id => {
          const note = byId.get(id)
          return (
            <li key={id}>
              <a
                href={notePath(id)}
                onClick={e => {
                  e.preventDefault()
                  navigate(notePath(id))
                }}
                className="block rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="font-medium">{note?.title ?? id}</span>
                {note?.excerpt && <span className="block truncate text-xs text-muted-foreground">{note.excerpt}</span>}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
