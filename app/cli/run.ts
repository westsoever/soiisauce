// app/cli/run.ts
// `soii run`: what the LaunchAgent runs. Builds soii for the registered vault, serves it on 127.0.0.1,
// and recompiles the vault (not the app) when notes change, so edits made in Obsidian, Claude Code or soii itself show up.
// If the server dies, this exits so launchd (KeepAlive) starts everything again.
import { readFileSync, watch } from 'node:fs'
import { join } from 'node:path'
import type { Subprocess } from 'bun'
import { isIgnoredVaultPath } from './watch'

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

export async function runSupervisor(o: RunOptions): Promise<void> {
  const env = runEnv(o)
  const spawn = (script: string, args: string[] = []) =>
    Bun.spawn(['bun', join(o.soiiRoot, 'app', script), ...args], { cwd: o.cwd, env, stdout: 'inherit', stderr: 'inherit' })
  const build = async (args: string[] = []) => (await spawn('build.ts', args).exited) === 0

  // A full build every start: the app may have been updated since the last one, and it only takes a moment.
  if (!(await build())) {
    console.error('soii: the first build failed, so there is nothing to serve. See the messages above.')
    process.exit(1)
  }

  let server: Subprocess | null = null
  let restarting = false
  const start = () => {
    const child = spawn('serve.ts')
    server = child
    void child.exited.then(code => {
      if (restarting || server !== child) return
      console.error(`soii: the server exited (${code}); exiting so it is started again.`)
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
  const rebuild = async (file: string) => {
    if (building) {
      again = true
      return
    }
    building = true
    do {
      again = false
      console.log(`soii: ${file} changed, recompiling the vault…`)
      // A failed compile (a typo in soii.config.yml, say) leaves the working build in place.
      if (await build(['--vault-only'])) await restart()
      else console.error('soii: recompiling failed, still serving the previous build.')
    } while (again)
    building = false
  }
  watch(o.vault, { recursive: true }, (_event, file) => {
    if (isIgnoredVaultPath(file)) return
    clearTimeout(timer)
    timer = setTimeout(() => void rebuild(String(file)), 300)
  })

  const stop = () => {
    restarting = true
    server?.kill()
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  await new Promise(() => {})
}
