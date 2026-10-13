// app/cli/commands.ts
// The commands of `soii`. Each takes a Ctx (see context.ts) so they can be driven from tests.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { Flags } from './args'
import { checkoutSoii, remoteUrl, soiiCheckout } from './checkout'
import type { Ctx } from './context'
import { copyTemplate, NOT_FOR_VAULTS, syncSkills } from './copy'
import { newChangelog } from './changelog'
import { versionLine, updateLinks } from './messages'
import { commitSoiiFiles } from './vault-commit'
import { chooseShimDir, logPath, renderShim } from './paths'
import { configDir, DEFAULT_PORT, readRegistry, removeRegistry, writeRegistry, type Registry } from './registry'
import { runSupervisor } from './run'
import { bootAtLogin, removeAgent, restartService, servicePid, startService, stopService, vaultCli, waitHealthy } from './service'
import { ensureLines, parsePin, pinSpec, renderSoiiPackageJson, setPin, SOII_GITIGNORE_LINES } from './vault-files'
import { isNewer, newestTag } from './version'

const SHIM_MARKER = '# soii shim'
/** How long to wait for the service to answer before saying it didn't. Starting it takes a few seconds. */
const HEALTH_WAIT_MS = 15_000
const FETCH_HINT = 'Check that this computer is online and can reach github.com, then try again. (Using a private fork of soii? Run `gh auth login` and then `gh auth setup-git` once so git can read it.)'

const expandHome = (ctx: Ctx, p: string) => (p === '~' ? ctx.home : p.startsWith('~/') ? join(ctx.home, p.slice(2)) : p)
const soiiDir = (vault: string) => join(vault, '.soii')
const installedRoot = soiiCheckout
const outDir = (vault: string) => join(soiiDir(vault), 'build')

function packageVersion(root: string): string | null {
  try {
    return (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string }).version ?? null
  } catch {
    return null
  }
}

function needRegistry(ctx: Ctx): Registry {
  const reg = readRegistry(configDir(ctx.env))
  if (!reg) throw new Error('soii is not installed on this machine yet. Run `soii install` inside your vault, or `soii init <folder>` to start a new one.')
  return reg
}

// ---- install ----

/**
 * Make sure <vault>/.soii has its pin (package.json) and .gitignore, and say which ref to install.
 * `flags.from` (a tag, or a branch for testing) moves the pin; otherwise a new pin follows the running CLI's version.
 */
function prepareSoiiDir(ctx: Ctx, vault: string, flags: Flags): string {
  const here = soiiDir(vault)
  mkdirSync(here, { recursive: true })
  const pkgFile = join(here, 'package.json')
  const version = packageVersion(ctx.pkgRoot)
  if (!existsSync(pkgFile)) {
    const ref = flags.from ?? version
    if (!ref) throw new Error('Cannot tell which soii version to pin. Pass --from v0.1.0.')
    writeFileSync(pkgFile, renderSoiiPackageJson(pinSpec(ref)))
  } else if (flags.from) {
    writeFileSync(pkgFile, setPin(readFileSync(pkgFile, 'utf8'), pinSpec(flags.from)))
  }
  const ref = parsePin(readFileSync(pkgFile, 'utf8'))
  if (!ref) throw new Error(`${pkgFile} doesn't pin a soii version ("soii": "github:westsoever/soiisauce#v0.1.0"). Fix it, or pass --from v0.1.0.`)
  const ignoreFile = join(here, '.gitignore')
  writeFileSync(ignoreFile, ensureLines(existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '', SOII_GITIGNORE_LINES))
  return ref
}


/**
 * Install the packages of the checkout at `root`. A fresh checkout has no node_modules, and the CLI in it can't even
 * start without them, so anything that runs a newly fetched checkout must call this first.
 * The lockfile in the tag is the lock: every install of v0.1.0 gets the same packages.
 */
export async function installDeps(ctx: Ctx, root: string): Promise<boolean> {
  let deps = await ctx.stream('bun', ['install', '--frozen-lockfile'], { cwd: root })
  if (deps !== 0) deps = await ctx.stream('bun', ['install'], { cwd: root })
  if (deps !== 0) ctx.err(`soii: \`bun install\` failed in ${root}.`)
  return deps === 0
}

export async function install(ctx: Ctx, vaultArg: string | undefined, flags: Flags): Promise<number> {
  const vault = resolve(ctx.cwd, expandHome(ctx, vaultArg ?? ctx.cwd))
  if (!existsSync(vault) || !statSync(vault).isDirectory()) throw new Error(`${vault} is not a folder.`)
  const here = soiiDir(vault)
  mkdirSync(here, { recursive: true })

  const ref = prepareSoiiDir(ctx, vault, flags)
  ctx.out(`Installing soii ${ref} into ${here} …`)
  // The packages are installed in the new copy before it is put in place, so a failed install changes nothing.
  const fetched = await checkoutSoii(ctx, vault, ref, dir => installDeps(ctx, dir))
  if (!fetched.ok) {
    ctx.err(`soii: ${fetched.message}\n${FETCH_HINT}`)
    return 1
  }
  const root = installedRoot(vault)
  // A tag that was already there wasn't fetched, so its packages are checked in place (this also repairs a deleted node_modules).
  if (!fetched.changed && !(await installDeps(ctx, root))) return 1

  const previous = readRegistry(configDir(ctx.env))
  const port = flags.port ?? (previous && previous.vault === vault ? previous.port : DEFAULT_PORT)
  // At login unless the owner said no (the wizard asks); a re-install or update keeps what this vault had.
  const boot = flags.boot ?? !(previous && previous.vault === vault && previous.boot === false)
  const buildEnv = { SOII_LOCAL: '1', VAULT_PATH: vault, SOII_OUT_DIR: outDir(vault) }
  ctx.out('Building …')
  if ((await ctx.stream(ctx.bun, [join(installedRoot(vault), 'app', 'build.ts')], { cwd: here, env: buildEnv })) !== 0) {
    ctx.err('soii: the build failed. The message above says why (often a typo in soii.config.yml).')
    return 1
  }

  if (!flags.noService) {
    writeRegistry(configDir(ctx.env), { vault, port, ...(boot ? {} : { boot: false as const }) })
    if (previous && previous.vault !== vault) ctx.out(`This machine served ${previous.vault}; it now serves ${vault}.`)
    installShim(ctx, vault)
  }
  // soii-release (the maintainer's skill) is pointless inside a vault that runs soii.
  const skills = syncSkills(join(root, '.claude', 'skills'), join(vault, '.claude', 'skills'), join(here, 'skills.json'), NOT_FOR_VAULTS)
  if (skills.installed.length) ctx.out(`Skills: ${skills.installed.join(', ')} → ${join(vault, '.claude', 'skills')}`)
  if (skills.removed.length) ctx.out(`Removed skills soii no longer ships: ${skills.removed.join(', ')}`)

  // What soii just wrote goes in one commit, so the vault starts clean: /soii-health and /soii-setup stop on a dirty tree.
  const message = `soii: ${ctx.env.SOII_UPDATE === '1' ? 'update to' : 'install'} ${ref}`
  const committed = await commitSoiiFiles(ctx, vault, { skills: skills.installed, removed: skills.removed, message })
  if (committed.committed) ctx.out(`Committed soii's files in the vault (${message}).`)
  else if (committed.reason && committed.reason !== 'not a git repository') ctx.err(`soii: the vault was not committed (${committed.reason}). Commit .soii/package.json, .soii/.gitignore, .soii/skills.json and .claude/skills yourself.`)

  if (flags.noService) {
    ctx.out(`\nsoii ${ref} is installed in ${vault}. --no-service: no service was started and nothing outside the vault was changed (no \`soii\` command, no LaunchAgent, no registry).`)
    return 0
  }
  if (!boot) await removeAgent(ctx) // no LaunchAgent: soii runs now, and `soii start` runs it again later
  if (!(await servicePid(ctx)) && (await ctx.healthy(port))) {
    ctx.err(`soii: something else already answers on port ${port} (an old \`bun app/serve.ts\`?). Stop it, then run \`soii start\`.`)
    return 1
  }
  const started = await restartService(ctx, vault)
  if (!started.ok) {
    ctx.err(`soii: could not start the service: ${started.message}`)
    return 1
  }
  if (!(await waitHealthy(ctx, port, HEALTH_WAIT_MS))) {
    ctx.err(notAnswering(ctx, port, 'started'))
    return 1
  }
  ctx.out(`\nsoii is running: http://localhost:${port}`)
  ctx.out(
    ctx.platform === 'darwin' && boot
      ? 'It starts at login and restarts if it stops. `soii status` shows how it is doing.'
      : ctx.platform === 'darwin'
        ? 'It runs in the background for now and does not start at login: after a restart, run `soii start`. `soii status` shows how it is doing.'
        : 'It runs in the background. `soii status` shows how it is doing.'
  )
  return 0
}

/** "Started, but nothing answers" with the end of the log, so the reason is on screen. */
export function notAnswering(ctx: Ctx, port: number, what: string): string {
  const file = logPath(ctx.platform, ctx.home)
  let tail = ''
  try {
    tail = readFileSync(file, 'utf8').trimEnd().split('\n').slice(-20).join('\n')
  } catch {
    // no log yet
  }
  return `soii: ${what}, but nothing answers on port ${port} after ${HEALTH_WAIT_MS / 1000} seconds.${tail ? `\nLast lines of ${file}:\n${tail.replace(/^/gm, '  ')}` : `\nNo log at ${file} yet.`}\nMore with \`soii logs\`.`
}

function installShim(ctx: Ctx, vault: string): void {
  const choice = chooseShimDir({ home: ctx.home, pathEnv: ctx.env.PATH ?? '', exists: existsSync })
  const file = join(choice.dir, 'soii')
  let ours = true
  try {
    const stat = lstatSync(file)
    ours = stat.isSymbolicLink() || readFileSync(file, 'utf8').includes(SHIM_MARKER)
  } catch {
    // nothing there yet
  }
  if (!ours) {
    ctx.err(`soii: ${file} already exists and isn't soii's, so it was left alone. Remove it and run \`soii install\` again to get the global \`soii\` command.`)
    return
  }
  mkdirSync(choice.dir, { recursive: true })
  rmSync(file, { force: true })
  writeFileSync(file, renderShim({ bun: ctx.bun, script: vaultCli(vault) }))
  chmodSync(file, 0o755)
  ctx.out(`Command: ${file}`)
  if (!choice.onPath) ctx.out(`  ${choice.dir} is not on your PATH. Add this to your shell profile:\n    export PATH="${choice.dir}:$PATH"`)
}

// ---- init ----

/** `beforeCommit` runs after the starter is copied and before the first commit (the wizard copies an old vault's notes in there). */
export async function init(ctx: Ctx, dirArg: string, flags: Flags, beforeCommit?: (dest: string) => void | Promise<void>): Promise<number> {
  const dest = resolve(ctx.cwd, expandHome(ctx, dirArg))
  const template = join(ctx.pkgRoot, 'template')
  if (!existsSync(template)) throw new Error(`This soii package has no template/ folder (looked in ${template}).`)
  copyTemplate(template, dest, { empty: !flags.samples, title: flags.title ?? basename(dest) })
  // The template pins a tag; point it at the version running now, and ignore soii's own folders, before the first commit.
  prepareSoiiDir(ctx, dest, { ...flags, from: flags.from ?? packageVersion(ctx.pkgRoot) ?? undefined })
  ctx.out(`New vault in ${dest}${flags.samples ? ' (with sample notes)' : ' (empty)'}.`)
  if (beforeCommit) await beforeCommit(dest)

  if (!existsSync(join(dest, '.git'))) {
    const git = await ctx.exec('git', ['init', '-b', 'main'], { cwd: dest })
    if (git.code === 0) {
      await ctx.exec('git', ['add', '-A'], { cwd: dest })
      const commit = await ctx.exec('git', ['commit', '-q', '-m', 'Initial vault from the soii template'], { cwd: dest })
      ctx.out(commit.code === 0 ? 'Started a git repository and made the first commit.' : `Started a git repository. The first commit didn't happen (${commit.out.split('\n')[0]}); commit it yourself.`)
    }
  }
  return install(ctx, dest, flags)
}

// ---- running it ----

export async function start(ctx: Ctx): Promise<number> {
  const reg = needRegistry(ctx)
  if (!existsSync(vaultCli(reg.vault))) throw new Error(`${reg.vault} has no soii installed (.soii/soii is missing). Run \`soii install\` there.`)
  if (!(await servicePid(ctx)) && (await ctx.healthy(reg.port))) {
    ctx.err(`soii: something else already answers on port ${reg.port}. Stop it first.`)
    return 1
  }
  const r = await startService(ctx, reg.vault)
  if (!r.ok) {
    ctx.err(`soii: could not start: ${r.message}`)
    return 1
  }
  if (!(await waitHealthy(ctx, reg.port, HEALTH_WAIT_MS))) {
    ctx.err(notAnswering(ctx, reg.port, 'started'))
    return 1
  }
  ctx.out(`soii is running: http://localhost:${reg.port}`)
  return 0
}

export async function stop(ctx: Ctx): Promise<number> {
  needRegistry(ctx)
  await stopService(ctx)
  ctx.out(bootAtLogin(ctx) ? 'soii stopped. It starts again at your next login, or with `soii start`.' : 'soii stopped. `soii start` runs it again.')
  return 0
}

export async function restart(ctx: Ctx): Promise<number> {
  const reg = needRegistry(ctx)
  const r = await restartService(ctx, reg.vault)
  if (!r.ok) {
    ctx.err(`soii: could not restart: ${r.message}`)
    return 1
  }
  if (!(await waitHealthy(ctx, reg.port, HEALTH_WAIT_MS))) {
    ctx.err(notAnswering(ctx, reg.port, 'restarted'))
    return 1
  }
  ctx.out(`soii restarted: http://localhost:${reg.port}`)
  return 0
}

export async function status(ctx: Ctx): Promise<number> {
  const reg = readRegistry(configDir(ctx.env))
  if (!reg) {
    ctx.out('soii is not installed on this machine. Run `soii install` inside your vault, or `soii init <folder>`.')
    return 1
  }
  const pid = await servicePid(ctx)
  const up = await ctx.healthy(reg.port)
  const installed = packageVersion(installedRoot(reg.vault))
  const latestOut = await ctx.exec('git', ['ls-remote', '--tags', remoteUrl(ctx)], { timeoutMs: 15_000 })
  const latest = latestOut.code === 0 ? newestTag(latestOut.out) : null

  ctx.out(up ? 'soii is running' : pid ? 'soii is loaded but not answering yet (see `soii logs`)' : 'soii is not running (`soii start`)')
  ctx.out(`  url      http://localhost:${reg.port}`)
  ctx.out(`  pid      ${pid ?? '-'}`)
  ctx.out(`  vault    ${reg.vault}`)
  ctx.out(`  version  ${versionLine(installed, latest)}`)
  ctx.out(`  boot     ${ctx.platform === 'darwin' ? (bootAtLogin(ctx) ? 'LaunchAgent installed: starts at login, restarts if it stops' : 'no LaunchAgent: does not start at login (`soii start`)') : 'background process only'}`)
  ctx.out(`  log      ${logPath(ctx.platform, ctx.home)}`)
  return up ? 0 : 1
}

export async function open(ctx: Ctx): Promise<number> {
  const reg = needRegistry(ctx)
  const url = `http://localhost:${reg.port}`
  const code = await ctx.stream(ctx.platform === 'darwin' ? 'open' : 'xdg-open', [url])
  if (code !== 0) ctx.out(url)
  return 0
}

export async function logs(ctx: Ctx, follow: boolean): Promise<number> {
  const file = logPath(ctx.platform, ctx.home)
  if (!existsSync(file)) {
    ctx.out(`No log yet at ${file}.`)
    return 0
  }
  return ctx.stream('tail', ['-n', '100', ...(follow ? ['-f'] : []), file])
}

export async function check(ctx: Ctx): Promise<number> {
  const reg = needRegistry(ctx)
  return ctx.stream(ctx.bun, [join(installedRoot(reg.vault), 'scripts', 'check-vault.ts'), reg.vault])
}

// ---- update ----

export async function update(ctx: Ctx, flags: Flags): Promise<number> {
  const reg = needRegistry(ctx)
  const here = soiiDir(reg.vault)
  const pkgFile = join(here, 'package.json')
  if (!existsSync(pkgFile)) throw new Error(`${here}/package.json is missing. Run \`soii install\` in ${reg.vault}.`)

  const remote = await ctx.exec('git', ['ls-remote', '--tags', remoteUrl(ctx)], { timeoutMs: 30_000 })
  const latest = remote.code === 0 ? newestTag(remote.out) : null
  if (remote.code !== 0) {
    ctx.err(`soii: could not list soii's releases.\n${FETCH_HINT}`)
    return 1
  }
  if (!latest) {
    ctx.err('soii: no release tags found on GitHub yet.')
    return 1
  }
  const installed = packageVersion(installedRoot(reg.vault))
  if (!isNewer(installed, latest)) {
    ctx.out(`soii v${installed} is the latest release.`)
    return 0
  }
  ctx.out(`Updating soii ${installed ? `v${installed}` : '(unknown)'} → ${latest} …`)
  const changelogFile = (root: string) => join(root, 'CHANGELOG.md')
  const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
  const before = read(changelogFile(installedRoot(reg.vault)))

  // The new checkout has no node_modules yet, and the CLI run below can't start without them: they are installed in the
  // new copy before it replaces the old one, so a failed install leaves the working soii (and the pin) as they were.
  const fetched = await checkoutSoii(ctx, reg.vault, latest, dir => installDeps(ctx, dir))
  if (!fetched.ok) {
    ctx.err(`soii: ${fetched.message}\n${FETCH_HINT}`)
    return 1
  }
  writeFileSync(pkgFile, setPin(readFileSync(pkgFile, 'utf8'), pinSpec(latest)))
  const news = newChangelog(before, read(changelogFile(installedRoot(reg.vault))))
  if (news.length) ctx.out(`\nWhat's new:\n\n${news.join('\n\n')}`)
  ctx.out(`\n${updateLinks(installed, latest).join('\n')}\n`)
  // The new version rebuilds, refreshes the skills and restarts: its own install knows how.
  return ctx.stream(ctx.bun, [vaultCli(reg.vault), 'install', reg.vault, ...(flags.noService ? ['--no-service'] : [])], { env: { SOII_UPDATE: '1' } })
}

// ---- uninstall ----

export async function uninstall(ctx: Ctx): Promise<number> {
  const reg = readRegistry(configDir(ctx.env))
  await removeAgent(ctx)
  const choice = chooseShimDir({ home: ctx.home, pathEnv: ctx.env.PATH ?? '', exists: existsSync })
  for (const dir of new Set([choice.dir, join(ctx.home, '.bun', 'bin'), join(ctx.home, '.local', 'bin')])) {
    const file = join(dir, 'soii')
    try {
      if (!lstatSync(file).isSymbolicLink() && readFileSync(file, 'utf8').includes(SHIM_MARKER)) rmSync(file)
    } catch {
      // not there
    }
  }
  removeRegistry(configDir(ctx.env))
  ctx.out('soii is stopped and no longer starts at login. The `soii` command is removed.')
  if (reg) ctx.out(`Your notes and ${soiiDir(reg.vault)} are untouched. Delete .soii/ yourself if you want it gone.`)
  return 0
}

// ---- run (the service itself) ----

export async function run(ctx: Ctx): Promise<number> {
  const reg = needRegistry(ctx)
  await runSupervisor({ vault: reg.vault, port: reg.port, soiiRoot: installedRoot(reg.vault), outDir: outDir(reg.vault), cwd: soiiDir(reg.vault) })
  return 0
}


export const cliVersion = (ctx: Ctx): string => packageVersion(ctx.pkgRoot) ?? 'unknown'
