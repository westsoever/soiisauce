import { describe, expect, test } from 'bun:test'
import { isNewBuild } from './use-fresh-vault'

describe('isNewBuild', () => {
  test('only a different build after a known one counts', () => {
    expect(isNewBuild('2026-10-12T08:00:00Z', '2026-10-12T08:00:05Z')).toBe(true)
    expect(isNewBuild('2026-10-12T08:00:00Z', '2026-10-12T08:00:00Z')).toBe(false)
  })

  test('no baseline yet, or the server is restarting, is not a change', () => {
    expect(isNewBuild(null, '2026-10-12T08:00:05Z')).toBe(false)
    expect(isNewBuild('2026-10-12T08:00:00Z', null)).toBe(false)
  })
})
