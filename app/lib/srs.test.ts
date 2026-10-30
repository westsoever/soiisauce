import { describe, expect, test } from 'bun:test'
import { addDays, isDue, MIN_EASE, sm2, type CardState, type Grade } from './srs'

const TODAY = '2026-10-24'
/** Answer `grades` in a row, each on the day the card came due. */
const run = (grades: Grade[], from?: CardState) => {
  const states: CardState[] = []
  let state = from
  for (const g of grades) {
    state = sm2(state, g, state?.due ?? TODAY)
    states.push(state)
  }
  return states
}

describe('sm2', () => {
  test('a new card answered good three times: 1, 6, then 15 days, ease 2.5', () => {
    const states = run([3, 3, 3])
    expect(states.map(s => s.interval)).toEqual([1, 6, 15])
    expect(states.map(s => s.ease)).toEqual([2.5, 2.5, 2.5])
    expect(states.map(s => s.due)).toEqual(['2026-10-25', '2026-10-31', '2026-11-15'])
    expect(states[2]).toMatchObject({ reps: 3, lapses: 0, last: '2026-10-31' })
  })

  test('again: back to 1 day, reps 0, one more lapse, ease unchanged', () => {
    const [, , learned] = run([3, 3, 4])
    const forgot = sm2(learned, 1, '2026-11-20')
    expect(forgot).toEqual({ due: '2026-11-21', interval: 1, ease: learned.ease, reps: 0, lapses: 1, last: '2026-11-20' })
    // the next good answer starts the 1, 6 ladder again
    expect(sm2(forgot, 3, forgot.due)).toMatchObject({ interval: 1, reps: 1, lapses: 1 })
    expect(sm2(undefined, 1, TODAY)).toMatchObject({ interval: 1, reps: 0, lapses: 1, ease: 2.5 })
  })

  test('hard lowers the ease by 0.14 and easy raises it by 0.1', () => {
    expect(sm2(undefined, 2, TODAY).ease).toBe(2.36)
    expect(sm2(undefined, 4, TODAY).ease).toBe(2.6)
    const [, second] = run([3, 3])
    expect(sm2(second, 2, second.due)).toMatchObject({ ease: 2.36, interval: 15 })
  })

  test('the ease never drops below 1.3', () => {
    const states = run([2, 2, 2, 2, 2, 2, 2, 2, 2, 2])
    expect(states.at(-1)!.ease).toBe(MIN_EASE)
    expect(Math.min(...states.map(s => s.ease))).toBe(MIN_EASE)
  })

  test('a whole-number interval is not rounded up by floating point', () => {
    const state: CardState = { due: TODAY, interval: 50, ease: 2.22, reps: 5, lapses: 0, last: '2026-09-04' }
    expect(sm2(state, 3, TODAY).interval).toBe(111)
  })
})

describe('isDue', () => {
  test('due on the day and after; a new card is new, not due', () => {
    const state = sm2(undefined, 3, TODAY)
    expect(isDue(state, TODAY)).toBe(false)
    expect(isDue(state, '2026-10-25')).toBe(true)
    expect(isDue(state, '2026-12-01')).toBe(true)
    expect(isDue(undefined, TODAY)).toBe(false)
  })
})

test('addDays crosses months, years and daylight saving changes by calendar day', () => {
  expect(addDays('2026-10-24', 8)).toBe('2026-11-01')
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
})
