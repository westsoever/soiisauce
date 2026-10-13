// `soii install` and `soii update` install a new checkout's packages in the folder it is fetched into, and only then put it
// in .soii/soii. A failed `bun install` (offline, registry down) must leave nothing the shim or the LaunchAgent would run
// without node_modules. Real git against a local "remote"; `bun install` is faked.
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Flags } from './args'
import { checkoutSoii } from './checkout'
import { install, update } from './commands'
import { realCtx } from './context'
import { writeRegistry } from './registry'

const root = mkdtempSync(join(tmpdir(), 'soii-swap-'))
const remote = join(root, 'remote')
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' }).trim()

beforeAll(() => {
  mkdirSync(remote)
  git(remote, 'init', '-q')
  writeFileSync(join(remote, 'package.json'), '{"name":"soii","version":"0.1.0"}')
  writeFileSync(join(remote, 'marker.txt'), 'one')
  git(remote, 'add', '-A')
  git(remote, 'commit', '-q', '-m', 'one')
  git(remote, 'tag', 'v0.1.0')
  writeFileSync(join(remote, 'package.json'), '{"name":"soii","version":"0.2.0"}')
  writeFileSync(join(remote, 'marker.txt'), 'two')
  git(remote, 'commit', '-q', '-am', 'two')
  git(remote, 'tag', 'v0.2.0')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** A ctx whose `bun install` succeeds (writing a stand-in node_modules in its cwd) or fails; everything else is real. */
function rig(name: string, installCodes: number[]) {
  const out: string[] = []
  const errs: string[] = []
  const installs: string[] = []
  const config = join(root, `${name}-config`)
  const home = join(root, `${name}-home`)
  mkdirSync(home, { recursive: true })
  const ctx = {
    ...realCtx(),
    home,
    cwd: root,
    env: { ...process.env, SOII_REMOTE: remote, SOII_CONFIG_DIR: config, HOME: home },
    out: (m: string) => void out.push(m),
    err: (m: string) => void errs.push(m),
    stream: async (cmd: string, args: string[], opts?: { cwd?: string }) => {
      if (cmd === 'bun' && args[0] === 'install') {
        installs.push(opts?.cwd ?? '')
        const code = installCodes[installs.length - 1] ?? 1
        if (code === 0) {
          mkdirSync(join(opts!.cwd!, 'node_modules'), { recursive: true })
          writeFileSync(join(opts!.cwd!, 'node_modules', '.stand-in'), 'x')
        }
        return code
      }
      return 1 // the build and anything else: not reached in these tests
    },
  }
  return { ctx, out, errs, installs, config }
}

const flags = (over: Partial<Flags> = {}): Flags => ({ follow: false, samples: false, noService: true, help: false, json: false, ...over })
const checkoutDir = (vault: string) => join(vault, '.soii', 'soii')

test('a failed bun install on a first `soii install` leaves no .soii/soii, and says to run it again', async () => {
  const vault = join(root, 'fresh')
  mkdirSync(vault)
  const r = rig('fresh', [1, 1]) // frozen, then the plain fallback
  expect(await install(r.ctx, vault, flags({ from: 'v0.1.0' }))).toBe(1)
  expect(r.installs).toEqual([join(vault, '.soii', 'soii.new'), join(vault, '.soii', 'soii.new')])
  expect(existsSync(checkoutDir(vault))).toBe(false)
  expect(existsSync(`${checkoutDir(vault)}.new`)).toBe(false)
  expect(r.errs.join('\n')).toMatch(/try again|run .* again/i)
})

test('a failed bun install on a re-install keeps the working copy and its packages', async () => {
  const vault = join(root, 'again')
  mkdirSync(vault)
  const first = rig('again-1', [])
  await checkoutSoii(first.ctx, vault, 'v0.1.0', async () => true)
  mkdirSync(join(checkoutDir(vault), 'node_modules'))
  writeFileSync(join(checkoutDir(vault), 'node_modules', '.stand-in'), 'old')
  const r = rig('again-2', [1, 1])
  expect(await install(r.ctx, vault, flags({ from: 'v0.2.0' }))).toBe(1)
  expect(readFileSync(join(checkoutDir(vault), 'marker.txt'), 'utf8')).toBe('one')
  expect(readFileSync(join(checkoutDir(vault), 'node_modules', '.stand-in'), 'utf8')).toBe('old')
  expect(existsSync(`${checkoutDir(vault)}.new`)).toBe(false)
})

test('a failed bun install on `soii update` keeps the old copy, and the pin stays where it was', async () => {
  const vault = join(root, 'upd')
  mkdirSync(vault)
  const r = rig('upd', [1, 1])
  mkdirSync(join(vault, '.soii'), { recursive: true })
  const pin = '{\n  "name": "soii-vault",\n  "private": true,\n  "dependencies": {\n    "soii": "github:westsoever/soiisauce#v0.1.0"\n  }\n}\n'
  writeFileSync(join(vault, '.soii', 'package.json'), pin)
  await checkoutSoii(r.ctx, vault, 'v0.1.0', async () => true)
  writeRegistry(r.config, { vault, port: 5011 })
  expect(await update(r.ctx, flags())).toBe(1)
  expect(readFileSync(join(vault, '.soii', 'package.json'), 'utf8')).toBe(pin)
  expect(readFileSync(join(checkoutDir(vault), 'marker.txt'), 'utf8')).toBe('one')
  expect(existsSync(`${checkoutDir(vault)}.new`)).toBe(false)
  expect(r.installs).toEqual([join(vault, '.soii', 'soii.new'), join(vault, '.soii', 'soii.new')])
})

test('a tag that is already installed still gets its packages checked in place (a deleted node_modules is repaired)', async () => {
  const vault = join(root, 'repair')
  mkdirSync(vault)
  const r = rig('repair', [0])
  await checkoutSoii(r.ctx, vault, 'v0.1.0', async () => true) // no node_modules
  // The build is the next step and the rig's stream fails it: we only care that install ran in the live folder first.
  await install(r.ctx, vault, flags({ from: 'v0.1.0' }))
  expect(r.installs).toEqual([checkoutDir(vault)])
  expect(existsSync(join(checkoutDir(vault), 'node_modules', '.stand-in'))).toBe(true)
})
