// The People overview: who you've been in touch with and who you should reach out to.
// All the rules live in app/lib/people.ts; this file only renders them.
import { IconBrandLinkedin } from '@tabler/icons-react'
import { useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { birthdayCountdown } from '../../lib/person'
import { agoLabel, buildPulse, cadenceLabel, linkedinUrl, type PulseRow } from '../../lib/people'
import { asText } from '../../lib/read-field'
import type { NoteId, NoteMeta, ViewProps } from '../../lib/types'
import { Button } from '../ui/button'
import { OptionsError } from './cells'

const PulseOptionsSchema = z.object({
  cadence: z.record(z.string(), z.number().int().positive()).default({}),
  recentDays: z.number().int().positive().default(30),
  limit: z.number().int().positive().default(10)
}).strict()

export function PulseView({ tab, notes, openNote }: ViewProps) {
  const [showAll, setShowAll] = useState(false)
  const parsed = useMemo(() => PulseOptionsSchema.safeParse(tab.options ?? {}), [tab.options])
  const pulse = useMemo(() => (parsed.success ? buildPulse(notes, parsed.data, new Date()) : null), [notes, parsed])

  if (!parsed.success || !pulse) return <OptionsError view="pulse" error={parsed.error!} />
  // WorkspaceScreen shows the empty-tab state for zero notes.
  if (notes.length === 0) return null

  const { limit, recentDays } = parsed.data
  const reachOut = showAll ? pulse.reachOut : pulse.reachOut.slice(0, limit)
  // The LinkedIn lane is only reserved in sections where someone has a profile, so rows stay aligned without a dead gutter.
  const lane = (list: { note: NoteMeta }[]) => list.some(r => linkedinUrl(r.note.frontmatter.linkedin) !== null)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 max-md:px-3">
      <div className="grid grid-cols-3 gap-3 max-md:gap-2">
        <Tile label={`In touch, last ${recentDays} days`} value={pulse.recent.length} />
        <Tile label="Overdue" value={pulse.overdue} />
        <Tile label="Nothing logged yet" value={pulse.neverLogged} />
      </div>

      <Section title="Reach out" count={pulse.reachOut.length}>
        {pulse.reachOut.length === 0 ? (
          <Empty>
            Nobody is overdue. Give a relationship a cadence in the tab's options, or add <code>cadence: 30</code> to a person's frontmatter.
          </Empty>
        ) : (
          <>
            {reachOut.map(row => (
              <Row
                key={row.note.id}
                note={row.note}
                detail={row.lastSeen ? `last seen ${agoLabel(row.daysSince!)}` : 'nothing logged yet'}
                trailing={cadenceLabel(row.cadence!)}
                linkedinLane={lane(reachOut)}
                onOpen={openNote}
              />
            ))}
            {pulse.reachOut.length > limit && (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAll(v => !v)}>
                {showAll ? 'Show fewer' : `Show all ${pulse.reachOut.length}`}
              </Button>
            )}
          </>
        )}
      </Section>

      <Section title="Recently in touch" count={pulse.recent.length}>
        {pulse.recent.length === 0 ? (
          <Empty>
            No interactions in the last {recentDays} days. Log one as a dated line in a person's note, like <code>- 2026-10-12: coffee</code>.
          </Empty>
        ) : (
          pulse.recent.map((row: PulseRow) => (
            <Row key={row.note.id} note={row.note} trailing={agoLabel(row.daysSince!)} linkedinLane={lane(pulse.recent)} onOpen={openNote} />
          ))
        )}
      </Section>

      {pulse.birthdays.length > 0 && (
        <Section title="Birthdays soon" count={pulse.birthdays.length}>
          {pulse.birthdays.map(b => (
            <Row key={b.note.id} note={b.note} trailing={birthdayCountdown(b.days) ?? ''} linkedinLane={lane(pulse.birthdays)} onOpen={openNote} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-card p-4 shadow-xs max-md:p-3">
      <span className="text-xs break-words text-muted-foreground">{label}</span>
      <span className="text-2xl font-medium tabular-nums">{value}</span>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="flex h-8 items-center gap-2 px-1 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground tabular-nums">{count}</span>
      </h3>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-2 text-sm text-muted-foreground">{children}</p>
}

// Fixed lanes: name and detail, then the trailing label, then the LinkedIn slot when the section has one.
function Row({
  note,
  detail,
  trailing,
  linkedinLane,
  onOpen
}: {
  note: NoteMeta
  detail?: string
  trailing: string
  linkedinLane: boolean
  onOpen: (id: NoteId) => void
}) {
  const relationship = asText(note.frontmatter.relationship)
  const sub = [relationship, detail].filter(Boolean).join(' · ')
  const linkedin = linkedinUrl(note.frontmatter.linkedin)
  return (
    <div className="flex items-center gap-1 rounded-lg hover:bg-accent">
      <button type="button" onClick={() => onOpen(note.id)} className="flex min-w-0 flex-1 items-baseline gap-3 rounded-lg px-3 py-2 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{note.title}</span>
          {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{trailing}</span>
      </button>
      {linkedinLane && (
        <span className="flex size-8 shrink-0 items-center justify-center">
          {linkedin && (
            <a
              href={linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${note.title} on LinkedIn`}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <IconBrandLinkedin size={16} stroke={1.75} />
            </a>
          )}
        </span>
      )}
    </div>
  )
}
