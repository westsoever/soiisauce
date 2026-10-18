// app/cli/run.ts
// `soii run`: what the LaunchAgent runs. Builds soii for the registered vault, serves it on 127.0.0.1,
// and recompiles the vault (not the app) when notes change, so edits made in Obsidian, Claude Code or soii itself show up.
// If the server dies, this exits so launchd (KeepAlive) starts everything again.
import { fstatSync, readFileSync, statSync, watch } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Subprocess } from 'bun'
import { lineStamper, trimLog } from './log'
import { logPath } from './paths'
import { changeFilter, isIgnoredVaultPath, skillSignature } from './watch'

export interface RunOptions {
  vault: string
  port: number
  /** `<vault>/.soii/soii`, or a checkout of soii. */
  soiiRoot: string
  /** Where dist/ and api/_generated/ go: `<vault>/.soii/build`. */
  outDir: string
  /** Where bun picks up `.env.local`: `<vault>/.soii`. */
  cwd: string
  host?: string
}

/** The release the code in `soiiRoot` is (its package.json), so the app can tell when a newer one exists. */
function installedVersion(soiiRoot: string): string {
  try {
    return (JSON.parse(readFileSync(join(soiiRoot, 'package.json'), 'utf8')) as { version?: string }).version ?? ''
  } catch {
    return ''
  }
}

export function runEnv(o: RunOptions): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  return { ...env, SOII_LOCAL: '1', VAULT_PATH: o.vault, PORT: String(o.port), HOST: o.host ?? '127.0.0.1', SOII_OUT_DIR: o.outDir, SOII_VERSION: installedVersion(o.soiiRoot) }
}

/** The service log keeps the last ~2 MB, plus the previous ~2 MB in soii.log.1. */
const LOG_MAX_BYTES = 2 * 1024 * 1024

/** Trims the service log, but only when it is where this process writes (not when run by hand or in a test). */
function trimOwnLog(): void {
  const file = logPath(process.platform, homedir())
  try {
    if (fstatSync(1).ino !== statSync(file).ino) return
  } catch {
    return
  }
  trimLog(file, LOG_MAX_BYTES)
}

/** Copies a child's output to ours a line at a time, each line stamped with the time. */
async function pumpStamped(stream: ReadableStream<Uint8Array>, write: (s: string) => void): Promise<void> {
  const stamped = lineStamper(write)
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) stamped(decoder.decode(chunk.value, { stream: true }))
  stamped.flush()
}

export async function runSupervisor(o: RunOptions): Promise<void> {
  trimOwnLog()
  const env = runEnv(o)
  const toOut = (s: string) => void process.stdout.write(s)
  const toErr = (s: string) => void process.stderr.write(s)
  const log = lineStamper(toOut)
  const fail = lineStamper(toErr)
  const spawn = (script: string, args: string[] = []) => {
    const child = Bun.spawn(['bun', join(o.soiiRoot, 'app', script), ...args], { cwd: o.cwd, env, stdout: 'pipe', stderr: 'pipe' })
    void pumpStamped(child.stdout, toOut)
    void pumpStamped(child.stderr, toErr)
    return child
  }
  const build = async (args: string[] = []) => (await spawn('build.ts', args).exited) === 0

  // A full build every start: the app may have been updated since the last one, and it only takes a moment.
  if (!(await build())) {
    fail('soii: the first build failed, so there is nothing to serve. See the messages above.\n')
    process.exit(1)
  }

  let server: Subprocess | null = null
  let restarting = false
  const start = () => {
    const child = spawn('serve.ts')
    server = child
    void child.exited.then(code => {
      if (restarting || server !== child) return
      fail(`soii: the server exited (${code}); exiting so it is started again.\n`)
      process.exit(1)
    })
  }
  const restart = async () => {
    restarting = true
    const old = server
    old?.kill()
    await old?.exited
    restarting = false
    start()
  }
  start()

  let timer: ReturnType<typeof setTimeout> | undefined
  let building = false
  let again = false
  let skills = skillSignature(o.vault)
  const rebuild = async (file: string) => {
    if (building) {
      again = true
      return
    }
    building = true
    do {
      again = false
      // Whatever skills the watch or the timer saw is in this build, so the timer must not rebuild for it again.
      skills = skillSignature(o.vault)
      log(`soii: ${file} changed, recompiling the vault…\n`)
      // A failed compile (a typo in soii.config.yml, say) leaves the working build in place.
      if (await build(['--vault-only'])) await restart()
      else fail('soii: recompiling failed, still serving the previous build.\n')
    } while (again)
    building = false
  }
  const changed = changeFilter(o.vault)
  watch(o.vault, { recursive: true }, (_event, file) => {
    if (isIgnoredVaultPath(file) || !changed(String(file))) return
    clearTimeout(timer)
    timer = setTimeout(() => void rebuild(String(file)), 300)
  })
  // The watch can miss a skill folder created in one go inside a folder that was not there at start (Bun 1.2 on Linux).
  setInterval(() => {
    if (skillSignature(o.vault) === skills) return
    clearTimeout(timer)
    timer = setTimeout(() => void rebuild('.claude/skills'), 300)
  }, 2000).unref()

  const stop = () => {
    restarting = true
    server?.kill()
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  await new Promise(() => {})
}
