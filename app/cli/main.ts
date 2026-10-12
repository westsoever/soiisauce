// app/cli/main.ts
// `soii`: dispatch a command line to its command.
import { parseArgs, type Command } from './args'
import * as commands from './commands'
import { realCtx, type Ctx } from './context'

export const HELP = `soii: your vault, as an app, on this machine.

Usage: soii <command> [options]

  init <folder>        New vault from the starter (add --empty for no sample notes), then install
  install [vault]      Install soii into a vault's .soii/ folder and start it (default: this folder)
  start | stop | restart
  status               Is it running? Which vault, version, port
  open                 Open it in your browser
  logs [-f]            Show the log (-f to follow)
  update               Move to the newest release and restart
  check                Check the vault's frontmatter and structure
  uninstall            Stop it, remove the LaunchAgent and the soii command (notes untouched)

Options: --port <n>, --from <tag> (install, init), --title <name> (init), --no-service (install, init, update:
  install into the vault only, with no service and nothing outside the vault; SOII_NO_SERVICE=1 does the same), --help, --version
It listens on http://localhost:5011 only.`

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
    install: () => commands.install(ctx, positional[0], flags),
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
  }
}
