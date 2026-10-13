import { describe, expect, test } from 'bun:test'
import { parseArgs } from './args'

test('a bare command is parsed with no positionals or flags', () => {
  expect(parseArgs(['status'])).toEqual({ ok: true, command: 'status', positional: [], flags: { follow: false, samples: false, noService: false, help: false, json: false } })
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

test('init makes an empty vault unless --samples; --empty still works', () => {
  expect(parseArgs(['init', 'my-vault'])).toMatchObject({ ok: true, command: 'init', positional: ['my-vault'], flags: { samples: false } })
  expect(parseArgs(['init', 'my-vault', '--samples'])).toMatchObject({ ok: true, flags: { samples: true } })
  const r = parseArgs(['init', 'my-vault', '--empty'])
  expect(r).toMatchObject({ ok: true, command: 'init', positional: ['my-vault'], flags: { samples: false } })
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
  expect(parseArgs(['install', '--from'])).toEqual({ ok: false, error: '--from needs a value, e.g. github:westsoever/soiisauce#v0.1.0.' })
})

test('too many positionals is an error', () => {
  expect(parseArgs(['status', 'extra'])).toEqual({ ok: false, error: '`soii status` takes no arguments.' })
  expect(parseArgs(['install', 'a', 'b'])).toEqual({ ok: false, error: '`soii install` takes at most one vault path.' })
})

test('init requires a directory', () => {
  expect(parseArgs(['init'])).toEqual({ ok: false, error: '`soii init` needs a directory, e.g. `soii init ~/my-vault`.' })
})

test('--no-service is accepted by install, init and update', () => {
  for (const argv of [['install', '--no-service'], ['init', 'v', '--no-service'], ['update', '--no-service']]) {
    const r = parseArgs(argv)
    expect(r.ok && r.flags.noService).toBe(true)
  }
  expect(parseArgs(['status', '--no-service'])).toEqual({ ok: false, error: 'Unknown option "--no-service" for `soii status`.' })
})

test('SOII_NO_SERVICE=1 means the same as --no-service', () => {
  const r = parseArgs(['install'], { SOII_NO_SERVICE: '1' })
  expect(r.ok && r.flags.noService).toBe(true)
  const off = parseArgs(['install'], { SOII_NO_SERVICE: '0' })
  expect(off.ok && off.flags.noService).toBe(false)
  const other = parseArgs(['status'], { SOII_NO_SERVICE: '1' })
  expect(other.ok && other.flags.noService).toBe(false)
})

test('init takes --title, and it needs a value', () => {
  const r = parseArgs(['init', 'v', '--title', "Ana's notes"])
  expect(r).toMatchObject({ ok: true, flags: { title: "Ana's notes" } })
  expect(parseArgs(['init', 'v', '--title=Mine'])).toMatchObject({ ok: true, flags: { title: 'Mine' } })
  expect(parseArgs(['init', 'v', '--title'])).toEqual({ ok: false, error: '--title needs a value, e.g. --title "My vault".' })
  expect(parseArgs(['install', '--title', 'x'])).toEqual({ ok: false, error: 'Unknown option "--title" for `soii install`.' })
})
describe('soii view', () => {
  test('takes a subcommand, positionals and its options', () => {
    const p = parseArgs(['view', 'add', 'library', '--tab', '{"title":"A"}', '--vault', '/v', '--json'])
    expect(p).toMatchObject({ ok: true, command: 'view', positional: ['add', 'library'], flags: { tab: '{"title":"A"}', vault: '/v', json: true } })
    expect(parseArgs(['view', 'filter', 'people', 'network', '--query={"type":"person"}'])).toMatchObject({ ok: true, flags: { query: '{"type":"person"}' } })
    expect(parseArgs(['view', 'fields', '--type', 'book'])).toMatchObject({ ok: true, flags: { type: 'book' } })
  })
  test('other commands still take no options of view', () => {
    expect(parseArgs(['status', '--json'])).toMatchObject({ ok: false })
  })
})

test('install takes --yes (and -y); setup takes the install options but no vault and no --yes', () => {
  expect(parseArgs(['install', '--yes'])).toMatchObject({ ok: true, command: 'install', flags: { yes: true } })
  expect(parseArgs(['install', '-y'])).toMatchObject({ ok: true, flags: { yes: true } })
  expect(parseArgs(['install'])).toMatchObject({ ok: true, flags: {} })
  expect(parseArgs(['setup', '--no-service', '--port', '5099'])).toMatchObject({ ok: true, command: 'setup', positional: [], flags: { noService: true, port: 5099 } })
  expect(parseArgs(['setup', '~/v'])).toEqual({ ok: false, error: '`soii setup` takes no arguments.' })
  expect(parseArgs(['setup', '--yes'])).toEqual({ ok: false, error: 'Unknown option "--yes" for `soii setup`.' })
  const env = parseArgs(['setup'], { SOII_NO_SERVICE: '1' })
  expect(env.ok && env.flags.noService).toBe(true)
})
