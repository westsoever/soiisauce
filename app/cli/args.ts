// app/cli/args.ts
// `soii <command> [args] [options]`. Pure: argv in, a parsed command or an error message out.
export const COMMANDS = ['install', 'start', 'stop', 'restart', 'status', 'open', 'logs', 'update', 'init', 'check', 'uninstall', 'run', 'view', 'help', 'version'] as const
export type Command = (typeof COMMANDS)[number]

export interface Flags {
  port?: number
  from?: string
  title?: string
  follow: boolean
  empty: boolean
  /** Install into the vault only: no LaunchAgent, no background process, nothing global (registry, shim). */
  noService: boolean
  help: boolean
  /** `soii view`: the vault folder, the tab / query / sort as JSON, the type to list fields for, and machine-readable output. */
  vault?: string
  tab?: string
  query?: string
  sort?: string
  type?: string
  json: boolean
}

export type Parsed = { ok: true; command: Command; positional: string[]; flags: Flags } | { ok: false; error: string }

const PORT_ERROR = '--port needs a number from 1 to 65535.'
const isCommand = (s: string): s is Command => (COMMANDS as readonly string[]).includes(s)

// Options each command accepts (besides --help).
const OPTIONS: Record<Command, readonly string[]> = {
  install: ['--port', '--from', '--no-service'],
  init: ['--empty', '--port', '--from', '--title', '--no-service'],
  logs: ['--follow', '-f'],
  start: [],
  stop: [],
  restart: [],
  status: [],
  open: [],
  update: ['--no-service'],
  check: [],
  uninstall: [],
  run: [],
  view: ['--vault', '--tab', '--query', '--sort', '--type', '--json'],
  help: [],
  version: []
}

export function parseArgs(argv: string[], env: Record<string, string | undefined> = {}): Parsed {
  const flags: Flags = { follow: false, empty: false, noService: false, help: false, json: false }
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
    else if (name === '--no-service') flags.noService = true
    else if (name === '--json') flags.json = true
    else if (name === '--vault' || name === '--tab' || name === '--query' || name === '--sort' || name === '--type') {
      const raw = value()
      if (raw === undefined || raw.startsWith('--')) return { ok: false, error: `${name} needs a value.` }
      flags[name.slice(2) as 'vault' | 'tab' | 'query' | 'sort' | 'type'] = raw
    }
    else if (name === '--port') {
      const raw = value()
      const port = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : NaN
      if (!(port >= 1 && port <= 65535)) return { ok: false, error: PORT_ERROR }
      flags.port = port
    } else if (name === '--title') {
      const raw = value()
      if (!raw || raw.startsWith('--')) return { ok: false, error: '--title needs a value, e.g. --title "My vault".' }
      flags.title = raw
    } else if (name === '--from') {
      const raw = value()
      if (!raw || raw.startsWith('--')) return { ok: false, error: '--from needs a value, e.g. github:westsoever/soii#v0.1.0.' }
      flags.from = raw
    }
  }

  if (env.SOII_NO_SERVICE === '1' && ['install', 'init', 'update'].includes(command)) flags.noService = true

  if (!flags.help) {
    if (command === 'install' && positional.length > 1) return { ok: false, error: '`soii install` takes at most one vault path.' }
    if (command === 'init') {
      if (positional.length === 0) return { ok: false, error: '`soii init` needs a directory, e.g. `soii init ~/my-vault`.' }
      if (positional.length > 1) return { ok: false, error: '`soii init` takes exactly one directory.' }
    }
    if (command !== 'install' && command !== 'init' && command !== 'view' && positional.length > 0) return { ok: false, error: `\`soii ${command}\` takes no arguments.` }
  }
  return { ok: true, command, positional, flags }
}
