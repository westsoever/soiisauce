// app/lib/glob.test.ts
import { describe, expect, test } from 'bun:test'
import { matchesGlob } from './glob'

describe('matchesGlob', () => {
  const cases: [string, string, boolean][] = [
    ['**/daily_report/**', '06-Wiki/daily_report/2026-10-06.md', true],
    ['**/daily_report/**', 'daily_report/a.md', true],
    ['**/daily_report/**', '06-Wiki/daily_reports/a.md', false],
    ['**/Templates/**', '05-Knowledge/Templates/', true],
    ['**/Templates/**', '05-Knowledge/Templates/daily.md', true],
    ['**/Templates/**', '05-Knowledge/TemplatesX/daily.md', false],
    ['*.md', 'a.md', true],
    ['*.md', 'x/a.md', false],
    ['02-Projects/*/README.md', '02-Projects/pico/README.md', true],
    ['02-Projects/*/README.md', '02-Projects/pico/sub/README.md', false],
    ['**/weekly-*.md', '01-Daily/weekly-2026-07-05.md', true],
    ['**/weekly-*.md', 'weekly-x.md', true],
    ['**/finance/**', '03-Areas/Finance/subscriptions.md', true],
    ['{a,b}.md', 'b.md', true],
    ['{a,b}.md', 'c.md', false],
    ['notes/file?.md', 'notes/file1.md', true],
    ['notes/(x).md', 'notes/(x).md', true],
    ['**', 'anything/at/all.md', true],
    // wildcards inside {} alternatives
    ['*.{png,jpg}', 'a.jpg', true],
    ['{*.png,*.jpg}', 'a.png', true],
    ['{*.png,*.jpg}', 'a.jpg', true],
    ['{*.png,*.jpg}', 'a.gif', false],
    ['{*.png,*.jpg}', 'd/a.png', false],
    ['**/{daily_report,week_*}/**', '06-Wiki/daily_report/a.md', true],
    ['**/{daily_report,week_*}/**', '06-Wiki/week_2026/a.md', true],
    ['**/{daily_report,week_*}/**', 'week_1/a.md', true],
    ['**/{daily_report,week_*}/**', '06-Wiki/weekly/a.md', false],
    ['{a/*.md,b/**}', 'a/x.md', true],
    ['{a/*.md,b/**}', 'b/x/y.md', true],
    ['{a/*.md,b/**}', 'a/x/y.md', false],
    // a leading "./" or "/" is ignored, like picomatch
    ['./notes/*.md', 'notes/a.md', true],
    ['/notes/*.md', 'notes/a.md', true],
    ['./**/*.md', 'a/b.md', true],
    ['./notes/*.md', 'other/a.md', false]
  ]
  for (const [glob, path, expected] of cases) {
    test(`${glob} ${expected ? 'matches' : 'does not match'} ${path}`, () => {
      expect(matchesGlob(path, glob)).toBe(expected)
    })
  }

  test('a list matches when any glob matches', () => {
    expect(matchesGlob('06-Wiki/week_logs/w.md', ['**/week_report/**', '**/week_logs/**'])).toBe(true)
  })

  test('repeated **/ does not backtrack exponentially', () => {
    const repeated = `${'**/'.repeat(14)}needle.md`
    const path = `${'a/'.repeat(28)}hay.md`
    const start = performance.now()
    expect(matchesGlob(path, repeated)).toBe(false)
    expect(matchesGlob(`${path}/needle.md`, repeated)).toBe(true)
    expect(performance.now() - start).toBeLessThan(50)
  })

  test('interleaved **/ segments stay fast on long non-matching paths', () => {
    const glob = '**/a/**/a/**/a/**/a/**/a/**/b.md'
    const path = `${'a/'.repeat(40)}c.md`
    const start = performance.now()
    expect(matchesGlob(path, glob)).toBe(false)
    expect(performance.now() - start).toBeLessThan(50)
  })
})
