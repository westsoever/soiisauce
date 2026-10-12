import { expect, test } from 'bun:test'
import { parseArgs } from './args'

test('a bare command is parsed with no positionals or flags', () => {
  expect(parseArgs(['status'])).toEqual({ ok: true, command: 'status', positional: [], flags: { follow: false, empty: false, help: false } })
})

test('no arguments means help', () => {
  const r = parseArgs([])
  expect(r.ok && r.command).toBe('help')
})

test('install takes an optional vault path and --port / --from', () => {
  const r = parseArgs(['install', '~/notes', '--port', '5012', '--from', 'file:/tmp/soii'])
  expect(r).toMatchObject({ ok: true, command: 'install', positional: ['~/notes'], flags: { port: 5012, from: 'file:/tmp/soii' } })
})

test('--port=N and -f are understood', () => {
  const r = parseArgs(['logs', '-f'])
  expect(r.ok && r.flags.follow).toBe(true)
  const p = parseArgs(['install', '--port=6000'])
  expect(p.ok && p.flags.port).toBe(6000)
})

test('init takes a directory and --empty', () => {
  const r = parseArgs(['init', 'my-vault', '--empty'])
  expect(r).toMatchObject({ ok: true, command: 'init', positional: ['my-vault'], flags: { empty: true } })
})

test('--help and -h on any command set the help flag; --version and -v are the version command', () => {
  const r = parseArgs(['start', '--help'])
  expect(r.ok && r.flags.help).toBe(true)
  expect(parseArgs(['--version'])).toMatchObject({ ok: true, command: 'version' })
  expect(parseArgs(['-v'])).toMatchObject({ ok: true, command: 'version' })
  expect(parseArgs(['--help'])).toMatchObject({ ok: true, command: 'help' })
})

test('an unknown command is an error that names it', () => {
  const r = parseArgs(['frobnicate'])
  expect(r).toEqual({ ok: false, error: 'Unknown command "frobnicate". Run `soii help`.' })
})

test('an unknown flag is an error', () => {
  const r = parseArgs(['status', '--nope'])
  expect(r).toEqual({ ok: false, error: 'Unknown option "--nope" for `soii status`.' })
})

test('a bad or missing port is an error', () => {
  expect(parseArgs(['install', '--port', 'abc'])).toEqual({ ok: false, error: '--port needs a number from 1 to 65535.' })
  expect(parseArgs(['install', '--port', '70000'])).toEqual({ ok: false, error: '--port needs a number from 1 to 65535.' })
  expect(parseArgs(['install', '--port'])).toEqual({ ok: false, error: '--port needs a number from 1 to 65535.' })
})

test('--from without a value is an error', () => {
  expect(parseArgs(['install', '--from'])).toEqual({ ok: false, error: '--from needs a value, e.g. github:westsoever/soii#v0.1.0.' })
})

test('too many positionals is an error', () => {
  expect(parseArgs(['status', 'extra'])).toEqual({ ok: false, error: '`soii status` takes no arguments.' })
  expect(parseArgs(['install', 'a', 'b'])).toEqual({ ok: false, error: '`soii install` takes at most one vault path.' })
})

test('init requires a directory', () => {
  expect(parseArgs(['init'])).toEqual({ ok: false, error: '`soii init` needs a directory, e.g. `soii init ~/my-vault`.' })
})
