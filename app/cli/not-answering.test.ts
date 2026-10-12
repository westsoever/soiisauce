import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { notAnswering } from './commands'
import { realCtx } from './context'
import { logPath } from './paths'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
function ctxWithLog(lines: string[] | null) {
  const home = mkdtempSync(join(tmpdir(), 'soii-na-'))
  dirs.push(home)
  const ctx = { ...realCtx(), home, platform: 'darwin' as const }
  if (lines) {
    const file = logPath('darwin', home)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, `${lines.join('\n')}\n`)
  }
  return ctx
}

test('says what happened, after how long, and shows the last 20 lines of the log', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)
  const text = notAnswering(ctxWithLog(lines), 5011, 'started')
  expect(text).toContain('nothing answers on port 5011 after 15 seconds')
  expect(text).toContain('  line 30')
  expect(text).toContain('  line 11')
  expect(text).not.toContain('line 10\n')
  expect(text).not.toMatch(/line 1\b/)
  expect(text).toContain('`soii logs`')
})

test('without a log it says so instead of printing nothing', () => {
  expect(notAnswering(ctxWithLog(null), 5099, 'restarted')).toContain('No log at')
})
