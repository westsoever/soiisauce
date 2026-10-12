import { describe, expect, test } from 'bun:test'
import {
  agoLabel,
  buildPulse,
  cadenceDefaults,
  cadenceChoice,
  cadenceChoiceLabel,
  cadenceLabel,
  cadenceToStamp,
  cadenceWord,
  computeLastSeen,
  daysSince,
  latestDatedEntry,
  linkedinLabel,
  linkedinUrl,
  reachOut,
  relationshipCadence,
  resolveCadence
} from './people'
import { indexOf, note } from './life-test-utils'

describe('latestDatedEntry', () => {
  const today = '2026-10-12'

  test('newest dated list item wins, in any order', () => {
    const body = ['## Notes & dated interactions', '- 2026-08-13: email', '- 2026-09-02: coffee', '* 2026-07-01 call'].join('\n')
    expect(latestDatedEntry(body, today)).toBe('2026-09-02')
  })

  test('bold dates, nested bullets and date ranges count', () => {
    expect(latestDatedEntry('- **2026-09-24**: dinner', today)).toBe('2026-09-24')
    expect(latestDatedEntry('  - 2026-08-20/21: VIP pitch', today)).toBe('2026-08-20')
  })

  test('future dates, impossible dates and dates mid-sentence are ignored', () => {
    const body = ['- 2026-11-01: planned trip', '- 2026-02-30: typo', '- Until 2026-09-30: partner', 'Met on 2026-09-15 at TechBBQ'].join('\n')
    expect(latestDatedEntry(body, today)).toBeNull()
  })

  test('today counts', () => {
    expect(latestDatedEntry('- 2026-10-12: lunch', today)).toBe('2026-10-12')
  })
})

describe('computeLastSeen', () => {
  const today = '2026-10-12'

  test('the newer of last_contact and the body', () => {
    expect(computeLastSeen({ last_contact: '2026-10-01' }, '- 2026-09-01: call', today)).toBe('2026-10-01')
    expect(computeLastSeen({ last_contact: '2026-08-01T10:00' }, '- 2026-09-01: call', today)).toBe('2026-09-01')
  })

  test('unreadable or future last_contact is ignored', () => {
    expect(computeLastSeen({ last_contact: 'last summer' }, '', today)).toBeNull()
    expect(computeLastSeen({ last_contact: '2026-12-24' }, '- 2026-09-01: call', today)).toBe('2026-09-01')
  })
})

describe('linkedin', () => {
  test.each([
    ['https://www.linkedin.com/in/anna-berg/', 'https://www.linkedin.com/in/anna-berg/'],
    ['linkedin.com/in/anna-berg', 'https://linkedin.com/in/anna-berg'],
    ['anna-berg', 'https://www.linkedin.com/in/anna-berg'],
    ['in/anna-berg', 'https://www.linkedin.com/in/anna-berg'],
    ['@anna-berg', 'https://www.linkedin.com/in/anna-berg'],
    ['https://example.com/anna', null],
    ['javascript:alert(1)', null],
    ['two words', null],
    ['', null],
    [42, null]
  ])('%p → %p', (value, expected) => {
    expect(linkedinUrl(value)).toBe(expected)
  })

  test('label is the profile path', () => {
    expect(linkedinLabel('https://www.linkedin.com/in/anna-berg/')).toBe('in/anna-berg')
    expect(linkedinLabel('https://www.linkedin.com/company/pico')).toBe('company/pico')
  })
})

describe('resolveCadence', () => {
  const defaults = { friend: 30, mentor: 60, techbbq: 90 }

  test('relationship default, case-insensitive', () => {
    expect(resolveCadence(note('P/A', { relationship: 'Friend' }), defaults)).toBe(30)
    expect(resolveCadence(note('P/B', { relationship: 'contact' }), defaults)).toBeNull()
    expect(resolveCadence(note('P/C', {}), defaults)).toBeNull()
  })

  test('several relationships take the shortest cadence', () => {
    expect(resolveCadence(note('P/A', { relationship: ['techbbq', 'friend'] }), defaults)).toBe(30)
  })

  test.each([
    [14, 14],
    ['21', 21],
    ['weekly', 7],
    ['Monthly', 30],
    ['quarterly', 90],
    ['yearly', 365]
  ])('cadence %p → %p days', (cadence, days) => {
    expect(resolveCadence(note('P/A', { relationship: 'contact', cadence }), defaults)).toBe(days)
  })

  test.each(['never', 'none', false, 0])('cadence %p opts out', cadence => {
    expect(resolveCadence(note('P/A', { relationship: 'friend', cadence }), defaults)).toBeNull()
  })

  test('an unreadable cadence falls back to the relationship', () => {
    expect(resolveCadence(note('P/A', { relationship: 'friend', cadence: 'often' }), defaults)).toBe(30)
  })
})

describe('relationshipCadence', () => {
  const defaults = { friend: 30, mentor: 60 }

  test('the default for the relationship, ignoring the note\'s own cadence', () => {
    expect(relationshipCadence(note('P/A', { relationship: 'friend', cadence: 'never' }), defaults)).toBe(30)
    expect(relationshipCadence(note('P/B', { relationship: ['mentor', 'friend'] }), defaults)).toBe(30)
    expect(relationshipCadence(note('P/C', { relationship: 'contact' }), defaults)).toBeNull()
  })
})

describe('cadenceWord', () => {
  test.each([
    [7, 'weekly'],
    [14, 'fortnightly'],
    [30, 'monthly'],
    [90, 'quarterly'],
    [365, 'yearly'],
    [45, '45']
  ])('%p days → %p', (days, word) => {
    expect(cadenceWord(days)).toBe(word)
  })
})

describe('cadenceChoice', () => {
  test.each([
    [undefined, ''],
    [null, ''],
    ['', ''],
    ['monthly', 'monthly'],
    ['Quarterly', 'quarterly'],
    [30, 'monthly'],
    ['14', 'fortnightly'],
    [45, '45'],
    ['never', 'never'],
    [false, 'never'],
    ['often', 'often']
  ])('%p → %p', (value, choice) => {
    expect(cadenceChoice(value)).toBe(choice)
  })
})

describe('cadenceChoiceLabel', () => {
  test.each([
    ['weekly', 'Every week'],
    ['monthly', 'Every month'],
    ['quarterly', 'Every 3 months'],
    ['45', 'Every 45 days'],
    ['never', 'Never remind me'],
    ['often', 'often (soii can\'t read this)']
  ])('%p → %p', (choice, label) => {
    expect(cadenceChoiceLabel(choice)).toBe(label)
  })
})

describe('reachOut', () => {
  const defaults = { friend: 30 }

  test('the note\'s own cadence, or the relationship default marked as inherited', () => {
    expect(reachOut(note('P/A', { relationship: 'friend', cadence: 'quarterly' }), defaults)).toEqual({ label: 'every 3 months', inherited: false })
    expect(reachOut(note('P/B', { relationship: 'friend' }), defaults)).toEqual({ label: 'every month', inherited: true })
    expect(reachOut(note('P/C', { relationship: 'friend', cadence: 'often' }), defaults)).toEqual({ label: 'every month', inherited: true })
  })

  test('opted out says never; no cadence at all says nothing', () => {
    expect(reachOut(note('P/A', { relationship: 'friend', cadence: 'never' }), defaults)).toEqual({ label: 'never', inherited: false })
    expect(reachOut(note('P/B', { relationship: 'contact' }), defaults)).toBeNull()
  })
})

describe('cadenceToStamp', () => {
  const defaults = { friend: 30, mentor: 60 }

  test('a new friend gets monthly written into the note', () => {
    expect(cadenceToStamp(note('P/A', { relationship: 'contact' }), 'friend', defaults)).toBe('monthly')
    expect(cadenceToStamp(note('P/A', {}), ['family', 'friend'], defaults)).toBe('monthly')
  })

  test('other relationships get their own default, in days when no word fits', () => {
    expect(cadenceToStamp(note('P/A', {}), 'mentor', { mentor: 60 })).toBe('60')
  })

  test('a note that already has a cadence is left alone, whatever it says', () => {
    expect(cadenceToStamp(note('P/A', { cadence: 'quarterly' }), 'friend', defaults)).toBeNull()
    expect(cadenceToStamp(note('P/A', { cadence: 'never' }), 'friend', defaults)).toBeNull()
    expect(cadenceToStamp(note('P/A', { cadence: 14 }), 'friend', defaults)).toBeNull()
  })

  test('an empty `cadence:` counts as not set', () => {
    expect(cadenceToStamp(note('P/A', { cadence: null }), 'friend', defaults)).toBe('monthly')
  })

  test('no default for the relationship, no stamp', () => {
    expect(cadenceToStamp(note('P/A', {}), 'contact', defaults)).toBeNull()
    expect(cadenceToStamp(note('P/A', {}), null, defaults)).toBeNull()
  })
})

describe('cadenceDefaults', () => {
  test('reads the cadence map of the pulse tab', () => {
    const index = indexOf([])
    index.config.workspaces = [
      { id: 'finance', title: 'Finance', tabs: [{ id: 'x', title: 'X', view: 'table', query: {} }] },
      { id: 'people', title: 'People', tabs: [{ id: 'overview', title: 'Overview', view: 'pulse', query: { type: 'person' }, options: { cadence: { Friend: 30, mentor: 60 } } }] }
    ]
    expect(cadenceDefaults(index.config)).toEqual({ friend: 30, mentor: 60 })
  })

  test('no pulse tab, no defaults', () => {
    expect(cadenceDefaults(indexOf([]).config)).toEqual({})
  })
})

describe('daysSince', () => {
  test('calendar days in local time', () => {
    const now = new Date(2026, 9, 12, 23, 30)
    expect(daysSince('2026-10-12', now)).toBe(0)
    expect(daysSince('2026-10-11', now)).toBe(1)
    expect(daysSince('2026-07-12', now)).toBe(92)
  })
})

describe('buildPulse', () => {
  const now = new Date(2026, 9, 12)
  const person = (id: string, fm: Record<string, unknown>, lastSeen: string | null = null) => note(`People/${id}`, { type: 'person', ...fm }, { lastSeen })
  const options = { cadence: { friend: 30, techbbq: 90 }, recentDays: 30 }

  const notes = [
    person('Ann', { relationship: 'friend' }, '2026-10-10'), // 2 days, fine
    person('Bo', { relationship: 'friend' }, '2026-08-13'), // 60 days, 2.0×
    person('Cy', { relationship: 'techbbq' }, '2026-03-01'), // 225 days, 2.5×
    person('Di', { relationship: 'techbbq' }), // never logged
    person('Ed', { relationship: 'friend', cadence: 'never' }, '2026-01-01'), // opted out
    person('Fi', { relationship: 'contact' }, '2026-10-01'), // no cadence, recent
    person('Gu', { relationship: 'friend' }), // never logged, shorter cadence than Di
    person('Hu', { relationship: 'contact', birthday: '--10-20' }),
    person('Io', { relationship: 'friend', cadence: 'never', birthday: '--10-14' })
  ]

  test('reach out: most overdue relative to cadence, then never logged by cadence', () => {
    const pulse = buildPulse(notes, options, now)
    expect(pulse.reachOut.map(r => r.note.title)).toEqual(['Cy', 'Bo', 'Gu', 'Di'])
    expect(pulse.reachOut[0]).toMatchObject({ lastSeen: '2026-03-01', daysSince: 225, cadence: 90 })
    expect(pulse.reachOut[2]).toMatchObject({ lastSeen: null, daysSince: null, cadence: 30 })
  })

  test('counts', () => {
    const pulse = buildPulse(notes, options, now)
    expect(pulse.overdue).toBe(2)
    expect(pulse.neverLogged).toBe(2)
  })

  test('recently in touch: newest first, cadence or not', () => {
    expect(buildPulse(notes, options, now).recent.map(r => r.note.title)).toEqual(['Ann', 'Fi'])
  })

  test('birthdays within 30 days, soonest first, skipping people opted out', () => {
    const pulse = buildPulse(notes, options, now)
    expect(pulse.birthdays.map(b => [b.note.title, b.days])).toEqual([['Hu', 8]])
  })

  test('a person with no lastSeen field (older index) is treated as never logged', () => {
    const old = note('People/Old', { type: 'person', relationship: 'friend' })
    expect(buildPulse([old], options, now).neverLogged).toBe(1)
  })
})

describe('labels', () => {
  test.each([
    [0, 'today'],
    [1, 'yesterday'],
    [13, '13 days ago'],
    [14, '2 weeks ago'],
    [59, '8 weeks ago'],
    [60, '2 months ago'],
    [729, '24 months ago'],
    [730, '2 years ago']
  ])('agoLabel(%p) → %p', (days, label) => {
    expect(agoLabel(days)).toBe(label)
  })

  test.each([
    [1, 'every day'],
    [7, 'every week'],
    [14, 'every 2 weeks'],
    [30, 'every month'],
    [60, 'every 2 months'],
    [90, 'every 3 months'],
    [365, 'every year'],
    [45, 'every 45 days']
  ])('cadenceLabel(%p) → %p', (days, label) => {
    expect(cadenceLabel(days)).toBe(label)
  })
})
