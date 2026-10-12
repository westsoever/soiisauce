// The feed view (spec §13): one day at a time, newest first, rendered in full.
// The selected day lives in ?d=YYYY-MM-DD. It is read through Core's
// useLocationSearch and written with navigate(..., { replace: true }), so
// stepping through dates neither floods the back stack nor drifts from the URL (D36.1).
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  buildFeed,
  emptyMessage,
  feedHeading,
  neighbours,
  parseFeedOptions,
  selectDay,
  todayIn,
  undatedLabel,
  visibleDates
} from '../../lib/feed'
import type { Query, ViewProps } from '../../lib/types'
import { navigate, useLocationSearch } from '../lib/router'
import { OptionsError } from './cells'
import { DateList } from './feed/DateList'
import { FeedEntry } from './feed/FeedEntry'
import { FeedNav } from './feed/FeedNav'

function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-muted px-1 font-mono text-xs">
            {part}
          </code>
        ) : (
          part
        )
      )}
    </>
  )
}

function FeedEmpty({ query, undated }: { query: Query; undated: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      <p className="max-w-md">
        <InlineCode text={emptyMessage(query)} />
      </p>
      {undated > 0 && <p className="text-xs">{undatedLabel(undated)}</p>}
    </div>
  )
}

export function FeedView({ tab, notes, openNote }: ViewProps) {
  const options = parseFeedOptions(tab.options)
  const dateField = options.ok ? options.value.dateField : undefined
  const feed = useMemo(() => buildFeed(notes, dateField), [notes, dateField])
  const requested = new URLSearchParams(useLocationSearch()).get('d')
  const select = useCallback((date: string) => navigate(`${location.pathname}?d=${date}`, { replace: true }), [])
  const headingRef = useRef<HTMLDivElement>(null)
  const index = selectDay(feed, requested)
  const selected = index >= 0 ? feed.days[index] : null

  useEffect(() => {
    headingRef.current?.scrollIntoView({ block: 'start' })
  }, [selected?.date])

  if (!options.ok) return <OptionsError view="feed" error={options.error} />
  if (!selected) return <FeedEmpty query={tab.query} undated={feed.undated} />

  const { newer, older } = neighbours(feed, index)
  const dates = visibleDates(feed, index)
  const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone)

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-auto">
        <div ref={headingRef} className="mx-auto max-w-3xl px-4 py-6 md:px-8">
          <FeedNav
            date={selected.date}
            heading={feedHeading(selected.date)}
            isToday={selected.date === today}
            newer={newer}
            older={older}
            dates={dates}
            openNote={selected.notes.length === 1 ? () => openNote(selected.notes[0].id) : undefined}
            onSelect={select}
          />
          <div className="flex flex-col gap-10">
            {selected.notes.map(note => (
              <FeedEntry key={note.id} note={note} showTitle={selected.notes.length > 1} openNote={openNote} />
            ))}
          </div>
          {feed.undated > 0 && <p className="mt-10 text-xs text-muted-foreground">{undatedLabel(feed.undated)}</p>}
        </div>
      </div>
      <DateList className="max-lg:hidden" dates={dates} selected={selected.date} today={today} onSelect={select} />
    </div>
  )
}
