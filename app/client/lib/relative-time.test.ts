import { expect, test } from 'bun:test'

import { formatLastActive } from './relative-time'

const now = new Date('2026-10-02T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

test('missing or unreadable timestamps read as never', () => {
  expect(formatLastActive(null, now)).toBe('Never')
  expect(formatLastActive(undefined, now)).toBe('Never')
  expect(formatLastActive('not a date', now)).toBe('Never')
})

test('recent activity is relative', () => {
  expect(formatLastActive(ago(10_000), now)).toBe('Just now')
  expect(formatLastActive(ago(12 * 60_000), now)).toBe('12 min ago')
  expect(formatLastActive(ago(3 * 3_600_000), now)).toBe('3 h ago')
  expect(formatLastActive(ago(2 * 86_400_000), now)).toBe('2 d ago')
})

test('older than a week is a date', () => {
  // ICU versions disagree on "Sep" vs "Sept".
  expect(formatLastActive('2026-09-01T09:00:00Z', now)).toMatch(/^1 Sept? 2026$/)
})
