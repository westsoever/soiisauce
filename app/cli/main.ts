// app/cli/main.ts
// `soii`: dispatch a command line to its command.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, type Command } from './args'
import * as commands from './commands'
import { realCtx, type Ctx } from './context'
import { flushNotes } from './notes'
import { view } from './view'

export const HELP = `soii: your vault, as an app, on this machine.

Usage: soii <command> [options]

  init <folder>        New vault (empty; add --samples for Sam's sample notes), then install
  install [vault]      In a terminal, asks a few questions and sets everything up (new vault or your own notes).
                       With a vault path (or --yes, or no terminal): installs into that vault's .soii/ and starts it
  setup                The same questions as a bare "soii install", always (answers can be piped in)
  start | stop | restart
  status               Is it running? Which vault, version, port
  open                 Open it in your browser
  logs [-f]            Show the log (-f to follow)
  update               Move to the newest release and restart
  check                Check the vault's frontmatter and structure
  view fields|preview|add|filter|sort|remove|list
                       Read and change views (tabs) in soii.config.yml; used by /soii-view. --vault <dir>, --json
  uninstall            Stop it, remove the LaunchAgent and the soii command (notes untouched)

Options: --port <n>, --from <tag> (install, setup, init), --title <name> (init), --yes (install: never ask), --no-service (install, setup, init, update:
  install into the vault only, with no service and nothing outside the vault; SOII_NO_SERVICE=1 does the same), --help, --version
It listens on http://localhost:5011 only.`

/** Is `dir` a checkout of soii itself (bin/soii.ts and soii's own package.json)? Notes never belong in there. */
function isSoiiClone(dir: string): boolean {
  try {
    return existsSync(join(dir, 'bin', 'soii.ts')) && (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string }).name === 'soii'
  } catch {
    return false
  }
}

export async function main(argv: string[], ctx: Ctx = realCtx()): Promise<number> {
  const parsed = parseArgs(argv, ctx.env)
  if (!parsed.ok) {
    ctx.err(`soii: ${parsed.error}`)
    return 2
  }
  const { command, positional, flags } = parsed
  if (command === 'help' || flags.help) {
    ctx.out(HELP)
    return 0
  }
  const handlers: Record<Exclude<Command, 'help'>, () => Promise<number> | number> = {
    install: async () => {
      // A bare `soii install` in a terminal asks questions (D108), and so does one run inside the soii clone (installing
      // into the clone itself is never what anyone wants). A vault path, --yes or a pipe elsewhere keep the plain install.
      if (positional.length === 0 && !flags.yes && (ctx.interactive || isSoiiClone(ctx.cwd))) return (await import('./wizard')).runWizard(ctx, flags)
      return commands.install(ctx, positional[0], flags)
    },
    // `soii setup` always asks, so a script or a test can pipe the answers in.
    setup: async () => (await import('./wizard')).runWizard(ctx, flags),
    init: () => commands.init(ctx, positional[0], flags),
    start: () => commands.start(ctx),
    stop: () => commands.stop(ctx),
    restart: () => commands.restart(ctx),
    status: () => commands.status(ctx),
    open: () => commands.open(ctx),
    logs: () => commands.logs(ctx, flags.follow),
    update: () => commands.update(ctx, flags),
    check: () => commands.check(ctx),
    uninstall: () => commands.uninstall(ctx),
    run: () => commands.run(ctx),
    view: () => view(ctx, positional, flags),
    version: () => {
      ctx.out(`soii ${commands.cliVersion(ctx)}`)
      return 0
    }
  }
  try {
    return await handlers[command]()
  } catch (err) {
    ctx.err(`soii: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  } finally {
    flushNotes(ctx) // what the person still has to do goes last
  }
}
