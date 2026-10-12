import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LABEL, generatePlist } from './plist'

const base = {
  bun: '/Users/me/.bun/bin/bun',
  script: '/Users/me/vault/.soii/node_modules/soii/bin/soii.ts',
  workingDir: '/Users/me/vault/.soii',
  logPath: '/Users/me/Library/Logs/soii.log',
  path: '/Users/me/.bun/bin:/usr/bin:/bin'
}

test('the label is com.soii.server', () => {
  expect(LABEL).toBe('com.soii.server')
})

test('plist runs `bun <script> run` at load and keeps it alive', () => {
  const xml = generatePlist(base)
  expect(xml).toContain('<key>Label</key>\n  <string>com.soii.server</string>')
  expect(xml).toContain('<key>RunAtLoad</key>\n  <true/>')
  expect(xml).toContain('<key>KeepAlive</key>\n  <true/>')
  expect(xml).toMatch(/<key>ProgramArguments<\/key>\s*<array>\s*<string>\/Users\/me\/\.bun\/bin\/bun<\/string>\s*<string>\/Users\/me\/vault\/\.soii\/node_modules\/soii\/bin\/soii\.ts<\/string>\s*<string>run<\/string>\s*<\/array>/)
  expect(xml).toContain('<key>WorkingDirectory</key>\n  <string>/Users/me/vault/.soii</string>')
})

test('both stdout and stderr go to the log file', () => {
  const xml = generatePlist(base)
  expect(xml).toContain('<key>StandardOutPath</key>\n  <string>/Users/me/Library/Logs/soii.log</string>')
  expect(xml).toContain('<key>StandardErrorPath</key>\n  <string>/Users/me/Library/Logs/soii.log</string>')
})

test('PATH is passed so git and bun resolve under launchd', () => {
  expect(generatePlist(base)).toContain('<key>PATH</key>\n    <string>/Users/me/.bun/bin:/usr/bin:/bin</string>')
})

test('extra environment variables are passed through, escaped', () => {
  const xml = generatePlist({ ...base, env: { SOII_CONFIG_DIR: '/tmp/a&b' } })
  expect(xml).toContain('<key>SOII_CONFIG_DIR</key>\n    <string>/tmp/a&amp;b</string>')
})

test('XML special characters in paths are escaped', () => {
  const xml = generatePlist({ ...base, workingDir: '/Users/me/R&D <vault>/.soii' })
  expect(xml).toContain('/Users/me/R&amp;D &lt;vault&gt;/.soii')
  expect(xml).not.toContain('R&D')
})

test('the plist is valid for plutil', () => {
  const plutil = spawnSync('plutil', ['-help'])
  if (plutil.error) return // not macOS
  const dir = mkdtempSync(join(tmpdir(), 'soii-plist-'))
  try {
    const file = join(dir, 'x.plist')
    writeFileSync(file, generatePlist(base))
    const lint = spawnSync('plutil', ['-lint', file], { encoding: 'utf8' })
    expect(lint.stdout).toContain('OK')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
