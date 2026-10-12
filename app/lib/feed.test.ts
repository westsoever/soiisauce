import { describe, expect, test } from 'bun:test'
import type { NoteMeta, TabConfig } from './types'
import {
  BRIEF_EMPTY,
  GENERIC_EMPTY,
  buildFeed,
  emptyMessage,
  feedDate,
  feedHeading,
  hasToday,
  neighbours,
  parseFeedOptions,
  selectDay,
  todayIn,
  undatedLabel,
  visibleDates
} from './feed'

function note(id: string, over: Partial<NoteMeta> = {}): NoteMeta {
  const slash = id.lastIndexOf('/')
  return {
    id,
    title: id.slice(slash + 1),
    path: `${id}.md`,
    folder: slash === -1 ? '' : id.slice(0, slash),
    type: null,
    tags: [],
    date: null,
    updated: null,
    frontmatter: {},
    excerpt: '',
    image: null,
    wordCount: 0,
    ...over
  }
}

function tab(options?: Record<string, unknown>): TabConfig {
  return { id: 'brief', title: 'Brief', view: 'feed', query: { type: 'daily-brief' }, options }
}

describe('parseFeedOptions', () => {
  test('missing options are fine', () => {
    expect(parseFeedOptions(undefined)).toEqual({ ok: true, value: { dateField: undefined } })
  })
  test('dateField is read', () => {
    expect(parseFeedOptions({ dateField: 'published' })).toEqual({ ok: true, value: { dateField: 'published' } })
  })
  test('an unknown key is an error naming it, so typos are not silently ignored', () => {
    const result = parseFeedOptions({ dateFeild: 'published' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0].message).toContain('dateFeild')
  })
  test('an empty dateField is an error pointing at the option', () => {
    const result = parseFeedOptions({ dateField: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0].path).toEqual(['dateField'])
  })
  test('a non-object is an error', () => {
    expect(parseFeedOptions('nope').ok).toBe(false)
  })
})

describe('feedDate', () => {
  test('defaults to NoteMeta.date', () => {
    expect(feedDate(note('a', { date: '2026-10-06' }))).toBe('2026-10-06')
  })
  test('reads a NoteMeta date field by name', () => {
    expect(feedDate(note('a', { updated: '2026-10-01' }), 'updated')).toBe('2026-10-01')
  })
  test('reads a frontmatter field and drops the time part', () => {
    expect(feedDate(note('a', { frontmatter: { published: '2026-10-06T08:00:00Z' } }), 'published')).toBe('2026-10-06')
  })
  test('impossible or non-date values are null', () => {
    expect(feedDate(note('a', { date: '2026-02-30' }))).toBeNull()
    expect(feedDate(note('a', { frontmatter: { published: 'soon' } }), 'published')).toBeNull()
    expect(feedDate(note('a', { frontmatter: { published: 20261006 } }), 'published')).toBeNull()
  })
})

describe('buildFeed', () => {
  const notes = [
    note('r/2026-10-05', { date: '2026-10-05' }),
    note('r/b-2026-10-06', { title: 'Beta', date: '2026-10-06' }),
    note('r/a-2026-10-06', { title: 'Alpha', date: '2026-10-06' }),
    note('r/undated'),
    note('r/bad', { date: '2026-13-01' }),
    note('r/2026-09-30', { date: '2026-09-30' })
  ]

  test('groups by date, newest day first, notes within a day by title', () => {
    const feed = buildFeed(notes)
    expect(feed.days.map(d => d.date)).toEqual(['2026-10-06', '2026-10-05', '2026-09-30'])
    expect(feed.days[0].notes.map(n => n.title)).toEqual(['Alpha', 'Beta'])
  })
  test('notes without a valid date are counted, not shown', () => {
    expect(buildFeed(notes).undated).toBe(2)
  })
  test('the date the compiler chose is used as-is (frontmatter beats file name upstream)', () => {
    const feed = buildFeed([note('06-Wiki/daily_report/2026-10-04', { date: '2026-10-03' })])
    expect(feed.days[0].date).toBe('2026-10-03')
  })
  test('dateField switches the grouping field', () => {
    const feed = buildFeed([note('x', { date: '2026-01-01', frontmatter: { published: '2026-05-05' } })], 'published')
    expect(feed.days.map(d => d.date)).toEqual(['2026-05-05'])
  })
  test('an empty input gives an empty feed', () => {
    expect(buildFeed([])).toEqual({ days: [], undated: 0 })
  })
})

describe('selectDay / neighbours / visibleDates', () => {
  const feed = buildFeed(['2026-10-06', '2026-10-05', '2026-10-04'].map(d => note(d, { date: d })))

  test('selectDay finds the requested date', () => {
    expect(selectDay(feed, '2026-10-05')).toBe(1)
  })
  test('selectDay falls back to the newest day for unknown or missing dates', () => {
    expect(selectDay(feed, '1999-01-01')).toBe(0)
    expect(selectDay(feed, null)).toBe(0)
  })
  test('selectDay is -1 for an empty feed', () => {
    expect(selectDay({ days: [], undated: 3 }, '2026-10-05')).toBe(-1)
  })
  test('neighbours stop at both ends', () => {
    expect(neighbours(feed, 0)).toEqual({ newer: null, older: '2026-10-05' })
    expect(neighbours(feed, 1)).toEqual({ newer: '2026-10-06', older: '2026-10-04' })
    expect(neighbours(feed, 2)).toEqual({ newer: '2026-10-05', older: null })
    expect(neighbours({ days: [], undated: 0 }, -1)).toEqual({ newer: null, older: null })
  })

  const many = buildFeed(
    Array.from({ length: 40 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 31 - i)).toISOString().slice(0, 10)
      return note(d, { date: d })
    })
  )
  test('visibleDates caps at 30', () => {
    const dates = visibleDates(many, 0)
    expect(dates).toHaveLength(30)
    expect(dates[0]).toBe('2026-10-31')
  })
  test('visibleDates appends a selected date that is older than the window', () => {
    const dates = visibleDates(many, 35)
    expect(dates).toHaveLength(31)
    expect(dates[30]).toBe(many.days[35].date)
  })
  test('visibleDates honours a custom max', () => {
    expect(visibleDates(many, 0, 5)).toHaveLength(5)
  })
})

describe('feedHeading', () => {
  test('formats a long English date with weekday and comma', () => {
    expect(feedHeading('2026-10-06')).toBe('Tuesday, 6 October 2026')
    expect(feedHeading('2026-01-01')).toBe('Thursday, 1 January 2026')
  })
  test('returns the input unchanged when it is not a date', () => {
    expect(feedHeading('someday')).toBe('someday')
  })
})

describe('todayIn / hasToday (timezone edges)', () => {
  const lateEvening = new Date('2026-10-06T22:30:00Z')

  test('the same instant is a different day in different zones', () => {
    expect(todayIn('Europe/Copenhagen', lateEvening)).toBe('2026-10-07')
    expect(todayIn('America/Los_Angeles', lateEvening)).toBe('2026-10-06')
    expect(todayIn('UTC', lateEvening)).toBe('2026-10-06')
    expect(todayIn('Pacific/Kiritimati', new Date('2026-10-06T23:59:59.999Z'))).toBe('2026-10-07')
  })
  test('an unknown zone falls back to UTC instead of throwing', () => {
    expect(todayIn('Mars/Olympus_Mons', lateEvening)).toBe('2026-10-06')
  })
  test('hasToday uses the given zone', () => {
    const notes = [note('b', { date: '2026-10-07' })]
    expect(hasToday(notes, tab(), 'Europe/Copenhagen', lateEvening)).toBe(true)
    expect(hasToday(notes, tab(), 'America/Los_Angeles', lateEvening)).toBe(false)
  })
  test('hasToday is true when any dated note is today, even if a future-dated note is newer', () => {
    const notes = [note('plan', { date: '2026-10-09' }), note('b', { date: '2026-10-06' })]
    expect(hasToday(notes, tab(), 'UTC', lateEvening)).toBe(true)
  })
  test('hasToday honours dateField and is false for invalid options', () => {
    const notes = [note('b', { frontmatter: { published: '2026-10-06' } })]
    expect(hasToday(notes, tab({ dateField: 'published' }), 'UTC', lateEvening)).toBe(true)
    expect(hasToday(notes, tab({ dateField: '' }), 'UTC', lateEvening)).toBe(false)
  })
})

describe('emptyMessage / undatedLabel', () => {
  test('brief-shaped queries get the brief copy from the spec', () => {
    expect(BRIEF_EMPTY).toBe('Briefs appear here when notes have `type: daily-brief` or live in a `daily_report` folder.')
    expect(emptyMessage({ type: 'daily-brief' })).toBe(BRIEF_EMPTY)
    expect(emptyMessage([{ type: ['weekly-review'] }, { path: '**/daily_report/**' }])).toBe(BRIEF_EMPTY)
  })
  test('other queries get the generic copy', () => {
    expect(emptyMessage({ type: 'weekly-review' })).toBe(GENERIC_EMPTY)
    expect(emptyMessage([{ tag: 'journal' }])).toBe(GENERIC_EMPTY)
  })
  test('undated label is singular or plural', () => {
    expect(undatedLabel(1)).toBe("1 note without a date isn't shown here.")
    expect(undatedLabel(4)).toBe("4 notes without a date aren't shown here.")
  })
})
