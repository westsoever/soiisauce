import { describe, expect, test } from 'bun:test'
import { birthdayCountdown, daysUntilBirthday, formatMonthDay, hasDetails, initials, lastContactLabel, parseMonthDay, personFacts } from './person'
import { note } from './life-test-utils'

describe('initials', () => {
  test.each([
    ['Anna', 'A'],
    ['Anna Berg', 'AB'],
    ['  erica  van der berg ', 'EB'],
    ['anna-marie', 'AM'],
    ['J.R.R. Tolkien', 'JT'],
    ['Åse Ødegård', 'ÅØ'],
    ['😀 Smile', '😀S'],
    ['', '?']
  ])('%p → %p', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})

describe('birthdays', () => {
  const oct11 = new Date(2026, 9, 11)

  test.each([
    ['1990-10-11', 0, 'today'],
    ['1990-10-12', 1, 'tomorrow'],
    ['--10-20', 9, 'in 9 days'],
    ['11-10', 30, 'in 30 days'],
    ['1990-11-11', 31, null]
  ])('%p from 11 Oct 2026 → %p days (%p)', (birthday, days, label) => {
    expect(daysUntilBirthday(birthday, oct11)).toBe(days)
    expect(birthdayCountdown(daysUntilBirthday(birthday, oct11))).toBe(label)
  })

  test('wraps into next year', () => {
    expect(daysUntilBirthday('01-02', new Date(2026, 11, 30))).toBe(3)
  })

  test('29 February falls on 28 February in non-leap years', () => {
    expect(daysUntilBirthday('2000-02-29', new Date(2027, 1, 20))).toBe(8)
    expect(daysUntilBirthday('2000-02-29', new Date(2028, 1, 20))).toBe(9)
    expect(daysUntilBirthday('2000-02-29', new Date(2027, 2, 1))).toBe(365)
  })

  test.each(['1990-13-01', '02-30', 'soon', '', null, 19900314])('rejects %p', value => {
    expect(parseMonthDay(value)).toBeNull()
    expect(daysUntilBirthday(value, oct11)).toBeNull()
  })

  test('formatMonthDay', () => {
    expect(formatMonthDay({ month: 3, day: 14 })).toBe('14 March')
  })
})

describe('personFacts', () => {
  const today = new Date(2026, 9, 11)

  test('full person', () => {
    const facts = personFacts(
      note('People/Anna Berg', {
        type: 'person', relationship: ['partner', 'friend'], company: 'Pico', role: 'Designer',
        location: 'Copenhagen', last_contact: '2026-10-08', email: 'anna@example.com',
        phone: '+45 12 34 56 78', birthday: '1994-10-16'
      }),
      today
    )
    expect(facts).toEqual({
      initials: 'AB',
      relationship: 'partner, friend',
      work: 'Designer at Pico',
      location: 'Copenhagen',
      lastContact: '2026-10-08',
      email: 'anna@example.com',
      emailHref: 'mailto:anna@example.com',
      phone: '+45 12 34 56 78',
      phoneHref: 'tel:+4512345678',
      birthday: { label: '16 October', countdown: 'in 5 days' }
    })
    expect(hasDetails(facts)).toBe(true)
  })

  test('empty person', () => {
    const facts = personFacts(note('People/Erica', { type: 'person' }), today)
    expect(facts).toEqual({
      initials: 'E', relationship: null, work: null, location: null, lastContact: null,
      email: null, emailHref: null, phone: null, phoneHref: null, birthday: null
    })
    expect(hasDetails(facts)).toBe(false)
  })

  test('partial work info and unusable contact fields', () => {
    expect(personFacts(note('P/a', { company: 'Pico' }), today).work).toBe('Pico')
    expect(personFacts(note('P/b', { role: 'CTO' }), today).work).toBe('CTO')
    const odd = personFacts(note('P/c', { email: 'not an email', phone: 'ask Anna', birthday: 'unknown' }), today)
    expect(odd.email).toBe('not an email')
    expect(odd.emailHref).toBeNull()
    expect(odd.phoneHref).toBeNull()
    // Shown as written (like the email above), not dropped: `birthday` is hidden from the properties panel.
    expect(odd.birthday).toEqual({ label: 'unknown', countdown: null })
  })

  test('lastSeen (from dated lines in the body) wins over last_contact', () => {
    expect(personFacts(note('P/e', { last_contact: '2026-01-01' }, { lastSeen: '2026-09-30' }), today).lastContact).toBe('2026-09-30')
    expect(personFacts(note('P/f', { last_contact: 'last spring' }, { lastSeen: null }), today).lastContact).toBe('last spring')
  })

  test('far birthday shows its date without a countdown', () => {
    expect(personFacts(note('P/d', { birthday: '1990-03-14' }), today).birthday).toEqual({ label: '14 March', countdown: null })
  })
})

describe('lastContactLabel', () => {
  const now = new Date(2026, 9, 11, 12, 0)
  const relative = (iso: string) => `relative(${iso})`

  test('a past date is shown relatively', () => {
    expect(lastContactLabel('2026-10-08', now, relative)).toBe('relative(2026-10-08)')
    expect(lastContactLabel('2026-10-11', now, relative)).toBe('relative(2026-10-11)')
  })

  test('a future date is shown as a date, never "Just now" (D42)', () => {
    expect(lastContactLabel('2026-10-20', now, relative)).toBe('20 Oct 2026')
    expect(lastContactLabel('2026-10-20T09:30:00', now, relative)).toBe('20 Oct 2026')
  })

  test('text that is not a date is shown as written', () => {
    expect(lastContactLabel('last spring', now, relative)).toBe('last spring')
  })
})

describe('birthday text soii cannot read', () => {
  test.each([['16.10.1994'], ['October 16'], ['16/10'], [1016]])('%p is shown as written, with no countdown', value => {
    const facts = personFacts(note('p', { type: 'person', birthday: value }))
    expect(facts.birthday).toEqual({ label: String(value), countdown: null })
    expect(hasDetails(facts)).toBe(true)
  })

  test('a birthday soii can read is still formatted', () => {
    expect(personFacts(note('p', { birthday: '1994-10-16' }), new Date(2026, 9, 11)).birthday).toEqual({ label: '16 October', countdown: 'in 5 days' })
  })
})

describe('lastContactLabel with free text and calendar days', () => {
  const now = new Date(2026, 9, 12, 18, 0)
  const relative = (iso: string) => `relative(${iso})`

  test.each([['October 1'], ['1 Oct'], ['Summer 2025'], ['2026-13-45']])('%p is shown as written, never turned into another date', raw => {
    expect(lastContactLabel(raw, now, relative)).toBe(raw)
  })

  test('a date-only value is compared as a calendar day in the reader\'s own timezone', () => {
    expect(lastContactLabel('2026-10-12', now, relative)).toBe('relative(2026-10-12)')
    expect(lastContactLabel('2026-10-13', now, relative)).toBe('13 Oct 2026')
  })

  test('a date with a time later today is in the future', () => {
    expect(lastContactLabel('2026-10-12T20:00:00', now, relative)).toBe('12 Oct 2026')
  })
})
