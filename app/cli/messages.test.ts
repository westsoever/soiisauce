import { expect, test } from 'bun:test'
import { updateLinks, versionLine } from './messages'

test('after an update the release page and the comparison with the old version are linked', () => {
  expect(updateLinks('0.1.2', 'v0.1.3')).toEqual([
    'Release notes: https://github.com/westsoever/soii/releases/tag/v0.1.3',
    "What changed: https://github.com/westsoever/soii/compare/v0.1.2...v0.1.3"
  ])
})

test('with no known old version only the release page is linked', () => {
  expect(updateLinks(null, 'v0.1.3')).toEqual(['Release notes: https://github.com/westsoever/soii/releases/tag/v0.1.3'])
})

test('a v-prefixed old version is not doubled', () => {
  expect(updateLinks('v0.1.2', 'v0.1.3')[1]).toContain('/compare/v0.1.2...v0.1.3')
})

test('status says "run /soii-update" when a newer release exists', () => {
  expect(versionLine('0.1.2', 'v0.1.3')).toBe('v0.1.2   (v0.1.3 is available: run /soii-update in Claude Code, or `soii update`)')
})

test('status says latest when up to date, and unknown when GitHub could not be reached', () => {
  expect(versionLine('0.1.3', 'v0.1.3')).toBe('v0.1.3   (latest)')
  expect(versionLine('0.1.3', null)).toBe('v0.1.3   (latest unknown: could not reach GitHub)')
  expect(versionLine(null, null)).toBe('unknown   (latest unknown: could not reach GitHub)')
})
