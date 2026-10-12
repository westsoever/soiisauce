import { expect, test } from 'bun:test'
import { compareVersions, isNewer, newestTag, parseTag } from './version'

test('parseTag accepts vX.Y.Z only', () => {
  expect(parseTag('v0.1.0')).toEqual([0, 1, 0])
  expect(parseTag('v10.20.30')).toEqual([10, 20, 30])
  expect(parseTag('0.1.0')).toBeNull()
  expect(parseTag('v1.0')).toBeNull()
  expect(parseTag('v1.0.0-rc1')).toBeNull()
  expect(parseTag('release-3')).toBeNull()
})

test('compareVersions orders numerically, not as strings', () => {
  expect(compareVersions('v0.10.0', 'v0.9.0')).toBeGreaterThan(0)
  expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0)
  expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
  expect(compareVersions('v2.0.0', 'v1.99.99')).toBeGreaterThan(0)
})

test('newestTag picks the highest semver tag from `git ls-remote --tags` output and ignores peeled and junk refs', () => {
  const out = [
    'aaa111\trefs/tags/v0.1.0',
    'bbb222\trefs/tags/v0.1.0^{}',
    'ccc333\trefs/tags/v0.10.0',
    'ddd444\trefs/tags/v0.9.0',
    'eee555\trefs/tags/nightly',
    'fff666\trefs/tags/v1.0.0-rc1',
    ''
  ].join('\n')
  expect(newestTag(out)).toBe('v0.10.0')
})

test('newestTag is null when there are no release tags', () => {
  expect(newestTag('')).toBeNull()
  expect(newestTag('aaa\trefs/tags/nightly\n')).toBeNull()
})

test('isNewer compares an installed version with the latest tag', () => {
  expect(isNewer('0.1.0', 'v0.2.0')).toBe(true)
  expect(isNewer('0.2.0', 'v0.2.0')).toBe(false)
  expect(isNewer('0.3.0', 'v0.2.0')).toBe(false)
  expect(isNewer(null, 'v0.2.0')).toBe(true)
  expect(isNewer('0.1.0', null)).toBe(false)
})
