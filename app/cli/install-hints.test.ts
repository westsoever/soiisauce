// What `soii install` / `soii init` tell someone who is new to git and the terminal: the exact fix for a missing git
// identity, one clear PATH instruction at the very end, and a port that is taken said up front (before anything is written).
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { install, installShim, notAnswering } from './commands'
import { realCtx, type Ctx } from './context'
import { logPath } from './paths'
import { flushNotes } from './notes'
import { main } from './main'
import { readRegistry } from './registry'

const VERSION = (JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'package.json'), 'utf8')) as { version: string }).version // what a new pin follows
const root = mkdtempSync(join(tmpdir(), 'soii-hints-'))
const remote = join(root, 'remote')
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' }).trim()

beforeAll(() => {
  mkdirSync(join(remote, '.claude', 'skills', 'demo'), { recursive: true })
  writeFileSync(join(remote, 'package.json'), `{"name":"soii","version":"${VERSION}"}`)
  writeFileSync(join(remote, '.claude', 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n')
  git(remote, 'init', '-q')
  git(remote, 'add', '-A')
  git(remote, 'commit', '-q', '-m', 'one')
  git(remote, 'tag', `v${VERSION}`)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

// A machine where git has never been told who you are (a fresh Linux box). Other test files put an identity in process.env, so it is blanked here too.
const NO_IDENTITY = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.useConfigOnly', GIT_CONFIG_VALUE_0: 'true', GIT_AUTHOR_NAME: '', GIT_AUTHOR_EMAIL: '', GIT_COMMITTER_NAME: '', GIT_COMMITTER_EMAIL: '' }
const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }

function rig(name: string, o: { identity?: boolean; shell?: string; portInUse?: boolean; platform?: NodeJS.Platform; path?: string } = {}) {
  const out: string[] = []
  const errs: string[] = []
  const home = join(root, `${name}-home`)
  mkdirSync(home, { recursive: true })
  const real = realCtx()
  const ctx: Ctx = {
    ...real,
    home,
    cwd: root,
    platform: o.platform ?? 'linux',
    env: { ...process.env, SOII_REMOTE: remote, SOII_CONFIG_DIR: join(root, `${name}-config`), HOME: home, SHELL: o.shell ?? '/bin/zsh', PATH: o.path ?? '/usr/bin:/bin' },
    out: m => void out.push(m),
    err: m => void errs.push(m),
    portInUse: async () => o.portInUse ?? false,
    exec: (cmd, args, opts) => real.exec(cmd, args, { ...opts, env: { ...opts?.env, ...(o.identity === false ? NO_IDENTITY : IDENTITY) } }),
    stream: async (cmd, args, opts) => {
      if (cmd === 'bun' && args[0] === 'install') {
        mkdirSync(join(opts!.cwd!, 'node_modules'), { recursive: true })
        return 0
      }
      return 0 // the build
    }
  }
  return { ctx, out, errs, home }
}
const flagsNoService = ['--no-service']

test('git does not know who you are: init says so, and the end says exactly what to type and how to save the first commit', async () => {
  const { ctx, out } = rig('noid', { identity: false })
  const vault = join(root, 'noid-vault')
  expect(await main(['init', vault, ...flagsNoService], ctx)).toBe(0)
  const text = out.join('\n')
  expect(text).toContain("git doesn't know who you are")
  const last = out.slice(out.findIndex(l => l.startsWith('git doesn\'t know who you are')))
  expect(last.join('\n')).toContain('git config --global user.name "Your Name"')
  expect(last.join('\n')).toContain('git config --global user.email "you@example.com"')
  expect(last.join('\n')).toContain(`git -C "${vault}" commit -m "Initial vault"`)
  // said once, and last: nothing else is printed after it
  expect(text.match(/git config --global user\.name/g)).toHaveLength(1)
  expect(out.at(-1)).toContain('Initial vault')
})

test('an existing vault with commits: the end names the soii files to add and commit', async () => {
  const { ctx, out } = rig('noid2', { identity: false })
  const vault = join(root, 'noid2-vault')
  mkdirSync(vault)
  git(vault, 'init', '-q')
  writeFileSync(join(vault, 'a.md'), 'hi')
  git(vault, 'add', '-A')
  git(vault, 'commit', '-q', '-m', 'one') // made with an identity; soii's commit has none
  expect(await main(['install', vault, '--no-service'], ctx)).toBe(0)
  const text = out.join('\n')
  expect(text).toContain('git config --global user.email')
  expect(text).toContain(`git -C "${vault}" add .soii/package.json .soii/.gitignore .soii/skills.json .claude/skills`)
  expect(text).toContain(`soii: install v${VERSION}`)
})

test('with an identity, no git note is printed', async () => {
  const { ctx, out } = rig('withid')
  expect(await main(['init', join(root, 'withid-vault'), ...flagsNoService], ctx)).toBe(0)
  expect(out.join('\n')).not.toContain('git config --global')
})

test('a port that is taken is said before anything is written, with the --port fix', async () => {
  const { ctx, errs } = rig('port', { portInUse: true })
  const vault = join(root, 'port-vault')
  mkdirSync(vault)
  expect(await main(['install', vault], ctx)).toBe(1)
  const text = errs.join('\n')
  expect(text).toContain('port 5011 is already in use')
  expect(text).toContain('--port 5012')
  expect(text).not.toContain('EADDRINUSE')
  expect(existsSync(join(vault, '.soii'))).toBe(false)
  expect(readRegistry(join(root, 'port-config'))).toBeNull()
  expect(existsSync(join(ctx.home, '.local', 'bin', 'soii'))).toBe(false)
})

test('init on a taken port does not even create the vault', async () => {
  const { ctx, errs } = rig('port2', { portInUse: true })
  const vault = join(root, 'port2-vault')
  expect(await main(['init', vault], ctx)).toBe(1)
  expect(errs.join('\n')).toContain('--port 5012')
  expect(existsSync(vault)).toBe(false)
})

test('--port is honoured by the check: a taken 5011 does not matter when 5012 is asked for', async () => {
  const seen: number[] = []
  const { ctx } = rig('port3')
  ctx.portInUse = async p => (seen.push(p), true)
  const vault = join(root, 'port3-vault')
  mkdirSync(vault)
  await main(['install', vault, '--port', '5012'], ctx)
  expect(seen).toEqual([5012])
})

test('--no-service never looks at the port', async () => {
  const seen: number[] = []
  const { ctx } = rig('port4')
  ctx.portInUse = async p => (seen.push(p), true)
  expect(await main(['init', join(root, 'port4-vault'), '--no-service'], ctx)).toBe(0)
  expect(seen).toEqual([])
})

test('the real port check sees a listener, and a free port', async () => {
  const srv = createServer()
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r))
  const port = (srv.address() as { port: number }).port
  const ctx = realCtx()
  expect(await ctx.portInUse(port)).toBe(true)
  await new Promise<void>(r => srv.close(() => r()))
  expect(await ctx.portInUse(port)).toBe(false)
})

test('a server that died on EADDRINUSE is explained, not shown as a stack trace', () => {
  const { ctx } = rig('eaddr')
  const file = logPath(ctx.platform, ctx.home)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, '51 | Bun.serve({\n  error: Failed to start server. Is port 5098 in use?\n   code: "EADDRINUSE"\n')
  const text = notAnswering(ctx, 5098, 'started')
  expect(text).toContain('port 5098 is already in use')
  expect(text).toContain('--port 5099')
  expect(text).not.toContain('EADDRINUSE')
})

test("a shim that is not on PATH: one instruction at the very end, in the user's own shell's file", () => {
  for (const [shell, platform, expected] of [
    ['/bin/zsh', 'darwin', "echo 'export PATH=\"$HOME/.local/bin:$PATH\"' >> ~/.zshrc"],
    ['/bin/bash', 'darwin', "echo 'export PATH=\"$HOME/.local/bin:$PATH\"' >> ~/.bash_profile"],
    ['/bin/bash', 'linux', "echo 'export PATH=\"$HOME/.local/bin:$PATH\"' >> ~/.bashrc"],
    ['/opt/homebrew/bin/fish', 'darwin', 'fish_add_path "$HOME/.local/bin"']
  ] as const) {
    const { ctx, out, home } = rig(`shim-${shell.replaceAll('/', '_')}-${platform}`, { shell, platform })
    installShim(ctx, join(home, 'vault'))
    expect(out.join('\n')).not.toContain('export PATH') // not in the middle of the output
    flushNotes(ctx)
    expect(out.at(-1)).toContain(expected)
    expect(out.at(-1)).toContain('new terminal window')
    expect(out.at(-1)).toContain(join(home, '.local', 'bin', 'soii'))
  }
})

test('a shim put in a folder that is on PATH needs no instruction', () => {
  const { ctx, out, home } = rig('shim-ok', { path: `/usr/bin:${'/tmp/x'}` })
  const bin = join(home, '.local', 'bin')
  mkdirSync(bin, { recursive: true })
  ctx.env.PATH = `/usr/bin:${bin}`
  installShim(ctx, join(home, 'vault'))
  flushNotes(ctx)
  expect(out.join('\n')).not.toContain('export PATH')
  expect(readFileSync(join(bin, 'soii'), 'utf8')).toContain('# soii shim')
})
