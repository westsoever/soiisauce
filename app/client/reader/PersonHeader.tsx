// Reader header for `type: person` notes (spec §12). NoteReader renders this
// instead of its plain title, so the title lives here. Rows only render for
// fields that exist; an empty person still gets the avatar and a hint.
import type { ReactNode } from 'react'
import { cadenceDefaults, linkedinLabel, linkedinUrl, reachOut } from '../../lib/people'
import { lastContactLabel, personFacts } from '../../lib/person'
import { asText } from '../../lib/read-field'
import type { NoteDoc } from '../../lib/types'
import { useVault } from '../lib/queries'
import { formatLastActive } from '../lib/relative-time'
import { Avatar, AvatarFallback } from '../ui/avatar'

export function PersonHeader({ note }: { note: NoteDoc }) {
  const index = useVault().data
  const facts = personFacts(note)
  const reach = index ? reachOut(note, cadenceDefaults(index.config)) : null
  const lastContact = facts.lastContact ? lastContactLabel(facts.lastContact, new Date(), formatLastActive) : null
  const linkedin = linkedinUrl(note.frontmatter.linkedin)
  const rows: [string, ReactNode][] = []
  if (facts.relationship) rows.push(['Relationship', facts.relationship])
  if (facts.work) rows.push(['Work', facts.work])
  if (facts.location) rows.push(['Location', facts.location])
  if (lastContact) rows.push(['Last seen', lastContact])
  if (reach) {
    rows.push([
      'Reach out',
      <span>
        {reach.label}
        {reach.inherited && <span className="text-muted-foreground"> · default</span>}
      </span>
    ])
  }
  if (facts.email) rows.push(['Email', facts.emailHref ? <a className="underline-offset-4 hover:underline" href={facts.emailHref}>{facts.email}</a> : facts.email])
  if (facts.phone) rows.push(['Phone', facts.phoneHref ? <a className="tabular-nums underline-offset-4 hover:underline" href={facts.phoneHref}>{facts.phone}</a> : facts.phone])
  // `linkedin` is hidden from the properties panel, so text soii can't turn into a link is shown as written.
  const linkedinText = asText(note.frontmatter.linkedin)
  if (linkedin || linkedinText) {
    rows.push([
      'LinkedIn',
      linkedin ? (
        <a className="underline-offset-4 hover:underline" href={linkedin} target="_blank" rel="noopener noreferrer">
          {linkedinLabel(linkedin)}
        </a>
      ) : (
        linkedinText
      )
    ])
  }
  if (facts.birthday) {
    rows.push([
      'Birthday',
      <span>
        {facts.birthday.label}
        {facts.birthday.countdown && <span className="text-muted-foreground"> · {facts.birthday.countdown}</span>}
      </span>
    ])
  }

  return (
    <div className="mb-6 flex flex-col gap-4">
      <h1 className="text-2xl font-medium tracking-tight">{note.title}</h1>
      <div className="flex items-start gap-4">
        <Avatar size="lg" aria-hidden>
          <AvatarFallback>{facts.initials}</AvatarFallback>
        </Avatar>
        {rows.length > 0 ? (
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="self-center text-sm text-muted-foreground">No details yet. Add relationship, company or email to this note's frontmatter.</p>
        )}
      </div>
    </div>
  )
}
