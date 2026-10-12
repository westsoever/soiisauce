// app/cli/service.ts
// Starting and stopping the soii service: a LaunchAgent on macOS, a plain background process elsewhere.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { configDir } from './registry'
import type { Ctx } from './context'
import { parseLaunchctlPrint, type LaunchState } from './launchd'
import { LABEL, generatePlist } from './plist'
import { logPath, plistPath } from './paths'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The CLI pinned inside the vault: what the LaunchAgent and the shim run. */
export const vaultCli = (vault: string) => join(vault, '.soii', 'soii', 'bin', 'soii.ts')

export function servicePath(ctx: Ctx): string {
  const dirs = [join(ctx.home, '.bun', 'bin'), dirname(ctx.bun), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  return [...new Set(dirs)].join(':')
}

const target = (ctx: Ctx) => `gui/${ctx.uid}/${LABEL}`

// ---- macOS: launchd ----

export async function launchState(ctx: Ctx): Promise<LaunchState | null> {
  const r = await ctx.exec('launchctl', ['print', target(ctx)])
  return r.code === 0 ? parseLaunchctlPrint(r.out) : null
}

export function writeAgent(ctx: Ctx, vault: string): void {
  const file = plistPath(ctx.home)
  mkdirSync(dirname(file), { recursive: true })
  mkdirSync(dirname(logPath(ctx.platform, ctx.home)), { recursive: true })
  writeFileSync(file, generatePlist({ bun: ctx.bun, script: vaultCli(vault), workingDir: join(vault, '.soii'), logPath: logPath(ctx.platform, ctx.home), path: servicePath(ctx), env: ctx.env.SOII_CONFIG_DIR?.trim() ? { SOII_CONFIG_DIR: ctx.env.SOII_CONFIG_DIR.trim() } : undefined }))
}

async function bootout(ctx: Ctx): Promise<void> {
  if (await launchState(ctx)) await ctx.exec('launchctl', ['bootout', target(ctx)])
  // bootout returns before the job is gone; bootstrapping straight away can fail with an I/O error.
  for (let i = 0; i < 20 && (await launchState(ctx)); i++) await sleep(250)
}

async function bootstrap(ctx: Ctx): Promise<{ ok: boolean; message: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await ctx.exec('launchctl', ['bootstrap', `gui/${ctx.uid}`, plistPath(ctx.home)])
    if (r.code === 0) return { ok: true, message: '' }
    if (await launchState(ctx)) return { ok: true, message: '' }
    await sleep(500)
    if (attempt === 2) return { ok: false, message: r.out }
  }
  return { ok: false, message: 'launchctl bootstrap failed' }
}

// ---- elsewhere: a background process with a pid file ----

const pidFile = (ctx: Ctx) => join(configDir(ctx.env), 'soii.pid')

function readPid(ctx: Ctx): number | null {
  try {
    const pid = Number(readFileSync(pidFile(ctx), 'utf8').trim())
    process.kill(pid, 0)
    return pid
  } catch {
    return null
  }
}

function spawnBackground(ctx: Ctx, vault: string): void {
  const log = logPath(ctx.platform, ctx.home)
  mkdirSync(dirname(log), { recursive: true })
  const fd = openSync(log, 'a')
  const child = spawn(ctx.bun, [vaultCli(vault), 'run'], { cwd: join(vault, '.soii'), detached: true, stdio: ['ignore', fd, fd] })
  child.unref()
  mkdirSync(configDir(ctx.env), { recursive: true })
  writeFileSync(pidFile(ctx), String(child.pid))
}

// ---- the same operations on both ----

export async function servicePid(ctx: Ctx): Promise<number | null> {
  if (ctx.platform === 'darwin') return (await launchState(ctx))?.pid ?? null
  return readPid(ctx)
}

export const bootAtLogin = (ctx: Ctx): boolean => ctx.platform === 'darwin' && existsSync(plistPath(ctx.home))

/** Make sure the service is running; leaves a running one alone. */
export async function startService(ctx: Ctx, vault: string): Promise<{ ok: boolean; message: string }> {
  if (ctx.platform === 'darwin') {
    if (!existsSync(plistPath(ctx.home))) writeAgent(ctx, vault)
    if (await launchState(ctx)) return { ok: true, message: '' }
    return bootstrap(ctx)
  }
  if (readPid(ctx)) return { ok: true, message: '' }
  spawnBackground(ctx, vault)
  return { ok: true, message: '' }
}

export async function stopService(ctx: Ctx): Promise<void> {
  if (ctx.platform === 'darwin') return bootout(ctx)
  const pid = readPid(ctx)
  if (pid) process.kill(pid, 'SIGTERM')
  rmSync(pidFile(ctx), { force: true })
}

export async function restartService(ctx: Ctx, vault: string): Promise<{ ok: boolean; message: string }> {
  if (ctx.platform === 'darwin') {
    writeAgent(ctx, vault) // the paths in the plist follow the registered vault
    await bootout(ctx)
    return bootstrap(ctx)
  }
  await stopService(ctx)
  return startService(ctx, vault)
}

/** Wait until the server answers, up to `ms`. */
export async function waitHealthy(ctx: Ctx, port: number, ms = 60_000): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await ctx.healthy(port)) return true
    await sleep(500)
  }
  return false
}

export async function removeAgent(ctx: Ctx): Promise<void> {
  if (ctx.platform === 'darwin') {
    await bootout(ctx)
    rmSync(plistPath(ctx.home), { force: true })
  } else {
    await stopService(ctx)
  }
}
