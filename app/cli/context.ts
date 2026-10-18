// app/cli/context.ts
// Everything the commands touch outside their own arguments, in one object so tests can swap it.
import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import { readlinePrompter, type Prompter } from './prompt'

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

export interface Ctx {
  env: Record<string, string | undefined>
  home: string
  platform: NodeJS.Platform
  cwd: string
  uid: number
  /** The bun binary running this CLI. */
  bun: string
  /** Root of the soii package this CLI came from (its package.json, template/, .claude/skills/). */
  pkgRoot: string
  out(message: string): void
  err(message: string): void
  /** Run quietly and capture output. Never throws. */
  exec(cmd: string, args: string[], opts?: ExecOptions): Promise<{ code: number; out: string }>
  /** Run with the terminal attached; resolves to the exit code. */
  stream(cmd: string, args: string[], opts?: ExecOptions): Promise<number>
  /** Is a person typing at this terminal (stdin and stdout are both a TTY)? Only then does a bare `soii install` ask questions. */
  interactive: boolean
  /** Where the wizard reads its answers from. */
  prompter(): Prompter
  /** Does something answer /api/health on this port? */
  healthy(port: number): Promise<boolean>
  /** Is anything at all listening on this port (on this computer's loopback)? */
  portInUse(port: number): Promise<boolean>
}

export function realCtx(): Ctx {
  return {
    env: process.env,
    home: process.env.HOME ?? homedir(),
    platform: platform(),
    cwd: process.cwd(),
    uid: process.getuid?.() ?? 501,
    bun: process.execPath,
    pkgRoot: join(dirname(new URL(import.meta.url).pathname), '..', '..'),
    out: m => console.log(m),
    err: m => console.error(m),
    exec: (cmd, args, opts = {}) =>
      new Promise(resolve => {
        execFile(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env, GIT_TERMINAL_PROMPT: '0' }, timeout: opts.timeoutMs ?? 120_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0
          resolve({ code, out: `${stdout}${stderr}`.trim() })
        })
      }),
    stream: (cmd, args, opts = {}) =>
      new Promise(resolve => {
        const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: 'inherit' })
        child.on('error', () => resolve(127))
        child.on('close', code => resolve(code ?? 1))
      }),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    prompter: () => readlinePrompter(process.stdin, process.stdout),
    portInUse: port =>
      new Promise(resolve => {
        const server = createServer()
        server.once('error', err => resolve((err as NodeJS.ErrnoException).code === 'EADDRINUSE'))
        server.once('listening', () => server.close(() => resolve(false)))
        server.listen(port, '127.0.0.1')
      }),
    healthy: async port => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) })
        return res.ok
      } catch {
        return false
      }
    }
  }
}
