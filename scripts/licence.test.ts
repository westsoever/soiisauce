// soii is MIT licensed (see LICENSE), and the demo build output in .out/ is never tracked.
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

test('LICENSE is MIT and package.json says so, still private to npm', () => {
  const licence = readFileSync(join(root, 'LICENSE'), 'utf8')
  expect(licence.startsWith('MIT License\n\nCopyright (c) 2026 Sunseeker Labs\n')).toBe(true)
  expect(licence).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  expect(pkg.license).toBe('MIT')
  expect(pkg.private).toBe(true)
})

test('.out/ is ignored and not tracked', () => {
  expect(readFileSync(join(root, '.gitignore'), 'utf8').split('\n')).toContain('.out/')
  const tracked = Bun.spawnSync(['git', 'ls-files', '.out'], { cwd: root, stdout: 'pipe' }).stdout.toString()
  expect(tracked).toBe('')
})
