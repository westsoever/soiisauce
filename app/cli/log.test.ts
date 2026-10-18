import { afterAll, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lineStamper, stamp, trimLog } from './log'

const dir = mkdtempSync(join(tmpdir(), 'soii-log-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

test('a stamp is the local date and time, to the second', () => {
  expect(stamp(new Date(2026, 9, 15, 8, 5, 3))).toBe('2026-10-15 08:05:03')
})

test('the stamper prefixes every complete line, holding a partial line until it ends', () => {
  const out: string[] = []
  const at = new Date(2026, 9, 15, 8, 5, 3)
  const feed = lineStamper(s => out.push(s), () => at)
  feed('one\ntw')
  feed('o\n\nthree')
  expect(out.join('')).toBe('2026-10-15 08:05:03 one\n2026-10-15 08:05:03 two\n2026-10-15 08:05:03 \n')
  feed.flush()
  expect(out.join('')).toEndWith('2026-10-15 08:05:03 three\n')
})

test('a log over the limit is kept as soii.log.1 and emptied', () => {
  const file = join(dir, 'soii.log')
  writeFileSync(file, 'x'.repeat(2000))
  expect(trimLog(file, 1000)).toBe(true)
  expect(readFileSync(file, 'utf8')).toBe('')
  expect(readFileSync(`${file}.1`, 'utf8').length).toBe(2000)
})

test('a log under the limit, or no log, is left alone', () => {
  const file = join(dir, 'small.log')
  writeFileSync(file, 'abc')
  expect(trimLog(file, 1000)).toBe(false)
  expect(readFileSync(file, 'utf8')).toBe('abc')
  expect(existsSync(`${file}.1`)).toBe(false)
  expect(trimLog(join(dir, 'none.log'), 1000)).toBe(false)
})
