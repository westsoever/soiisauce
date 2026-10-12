// app/cli/args.ts
// `soii <command> [args] [options]`. Pure: argv in, a parsed command or an error message out.
export const COMMANDS = ['install', 'start', 'stop', 'restart', 'status', 'open', 'logs', 'update', 'init', 'check', 'uninstall', 'run', 'help', 'version'] as const
export type Command = (typeof COMMANDS)[number]

export interface Flags {
  port?: number
  from?: string
  follow: boolean
  empty: boolean
  help: boolean
}

export type Parsed = { ok: true; command: Command; positional: string[]; flags: Flags } | { ok: false; error: string }

const PORT_ERROR = '--port needs a number from 1 to 65535.'
const isCommand = (s: string): s is Command => (COMMANDS as readonly string[]).includes(s)

// Options each command accepts (besides --help).
const OPTIONS: Record<Command, readonly string[]> = {
  install: ['--port', '--from'],
  init: ['--empty', '--port', '--from'],
  logs: ['--follow', '-f'],
  start: [],
  stop: [],
  restart: [],
  status: [],
  open: [],
  update: [],
  check: [],
  uninstall: [],
  run: [],
  help: [],
  version: []
}

export function parseArgs(argv: string[]): Parsed {
  const flags: Flags = { follow: false, empty: false, help: false }
  const [first, ...rest] = argv
  if (first === undefined) return { ok: true, command: 'help', positional: [], flags }
  if (first === '--help' || first === '-h') return { ok: true, command: 'help', positional: [], flags }
  if (first === '--version' || first === '-v') return { ok: true, command: 'version', positional: [], flags }
  if (!isCommand(first)) return { ok: false, error: `Unknown command "${first}". Run \`soii help\`.` }
  const command = first
  const positional: string[] = []

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const name = eq === -1 ? arg : arg.slice(0, eq)
    const inline = eq === -1 ? undefined : arg.slice(eq + 1)
    if (name === '--help' || name === '-h') {
      flags.help = true
      continue
    }
    if (!name.startsWith('-')) {
      positional.push(arg)
      continue
    }
    if (!OPTIONS[command].includes(name)) return { ok: false, error: `Unknown option "${name}" for \`soii ${command}\`.` }
    const value = () => (inline !== undefined ? inline : rest[++i])
    if (name === '--follow' || name === '-f') flags.follow = true
    else if (name === '--empty') flags.empty = true
    else if (name === '--port') {
      const raw = value()
      const port = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : NaN
      if (!(port >= 1 && port <= 65535)) return { ok: false, error: PORT_ERROR }
      flags.port = port
    } else if (name === '--from') {
      const raw = value()
      if (!raw || raw.startsWith('--')) return { ok: false, error: '--from needs a value, e.g. github:westsoever/soii#v0.1.0.' }
      flags.from = raw
    }
  }

  if (!flags.help) {
    if (command === 'install' && positional.length > 1) return { ok: false, error: '`soii install` takes at most one vault path.' }
    if (command === 'init') {
      if (positional.length === 0) return { ok: false, error: '`soii init` needs a directory, e.g. `soii init ~/my-vault`.' }
      if (positional.length > 1) return { ok: false, error: '`soii init` takes exactly one directory.' }
    }
    if (command !== 'install' && command !== 'init' && positional.length > 0) return { ok: false, error: `\`soii ${command}\` takes no arguments.` }
  }
  return { ok: true, command, positional, flags }
}
