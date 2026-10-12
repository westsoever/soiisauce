// Reader header for media and research notes (spec §11): cover on the left
// (on top on phones), then title, creator, year, status, rating and links.
// NoteReader renders this instead of its plain title, so the title lives here.
import { IconExternalLink } from '@tabler/icons-react'
import type { NoteDoc } from '../../lib/types'
import { Badge } from '../ui/badge'
import { CoverImage } from '../views/gallery/CoverImage'
import { typeDefaults } from '../views/gallery/options'
import { Stars } from '../views/gallery/Stars'
import { mediaFacts } from './media-facts'

export function MediaHeader({ note }: { note: NoteDoc }) {
  const facts = mediaFacts(note)
  const showCover = note.type !== 'research' || note.image !== null
  const aspect = typeDefaults(note.type).aspect
  return (
    <div className="flex gap-4 max-sm:flex-col">
      {showCover && (
        <div className={aspect === 'video' ? 'w-full sm:w-64' : 'w-32 shrink-0 sm:w-36'}>
          <CoverImage src={note.image} title={note.title} aspect={aspect} className="rounded-lg shadow-xs" />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-2 text-sm">
        <h1 className="text-2xl font-medium tracking-tight">{note.title}</h1>
        {(facts.creator || facts.year) && (
          <p className="text-muted-foreground">{[facts.creator, facts.year].filter(Boolean).join(' · ')}</p>
        )}
        {(facts.status || facts.rating !== null) && (
          <div className="flex flex-wrap items-center gap-2">
            {facts.status && <Badge variant="secondary">{facts.status}</Badge>}
            {facts.rating !== null && <Stars rating={facts.rating} />}
          </div>
        )}
        {facts.links.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {facts.links.map(link => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                {link.label}
                <IconExternalLink size={12} stroke={1.75} aria-hidden />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
