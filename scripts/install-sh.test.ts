// scripts/install-sh.test.ts
// install.sh at the repo root: the one-command, no-AI install (D113). Runs the real script against a throwaway git repo
// whose bin/soii.ts only records how it was called, with a PATH that has exactly the tools each case needs.
import { afterAll, describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', 'install.sh')
const root = mkdtempSync(join(tmpdir(), 'soii-install-sh-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const which = (tool: string) => {
  const r = Bun.spawnSync(['/usr/bin/env', 'which', tool])
  return r.exitCode === 0 ? r.stdout.toString().trim() : null
}

/** A bin folder holding only the named tools, so "bun is missing" really is missing. */
function toolbox(name: string, tools: string[]): string {
  const dir = join(root, `bin-${name}`)
  mkdirSync(dir, { recursive: true })
  for (const t of tools) {
    const real = which(t)
    if (!real) throw new Error(`the test needs ${t} on PATH`)
    symlinkSync(real, join(dir, t))
  }
  return dir
}
const ALL = toolbox('all', ['git', 'bun', 'mktemp', 'rm'])
const NO_BUN = toolbox('no-bun', ['git', 'mktemp', 'rm'])
const NO_GIT = toolbox('no-git', ['bun', 'mktemp', 'rm'])
/** git and the rest, plus a `bun` that says it is `version` (and runs the real one for anything else). */
function fakeBun(version: string): string {
  const dir = toolbox(`bun-${version}`, ['git', 'mktemp', 'rm'])
  writeFileSync(join(dir, 'bun'), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${version}; exit 0; fi\nexec ${which('bun')} "$@"\n`)
  chmodSync(join(dir, 'bun'), 0o755)
  return dir
}

/** PATH with a `ps` that says the terminal this shell is on is `device` (the name under /dev), as `ps -o tty=` does. */
function fakePs(device: string): string {
  const dir = toolbox(`ps-${device}`, ['git', 'bun', 'mktemp', 'rm'])
  writeFileSync(join(dir, 'ps'), `#!/bin/sh\necho ${device}\n`)
  chmodSync(join(dir, 'ps'), 0o755)
  return dir
}
/** The stand-in /usr/bin/git on a Mac that has no command line tools: it only complains. */
function xcodeShimGit(): string {
  const dir = toolbox('git-shim', ['bun', 'mktemp', 'rm'])
  writeFileSync(join(dir, 'git'), `#!/bin/sh\necho "xcode-select: note: No developer tools were found, requesting install." >&2\nexit 1\n`)
  chmodSync(join(dir, 'git'), 0o755)
  return dir
}

/**
 * A git repo shaped like soii for the script's purposes: bin/soii.ts writes argv, stdin, cwd and whether the packages were
 * installed to $FAKE_OUT. Its package.json has a postinstall that leaves an `installed` marker, so a test can see that
 * install.sh ran `bun install` in the clone before soii. `extraDeps` makes package.json disagree with bun.lock.
 */
function fakeRepo(name: string, extraDeps: Record<string, string> = {}): string {
  const dir = join(root, name)
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(
    join(dir, 'bin', 'soii.ts'),
    `import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const stdin = await new Response(Bun.stdin.stream()).text()
const installed = existsSync(join(import.meta.dir, '..', 'installed'))
writeFileSync(process.env.FAKE_OUT!, JSON.stringify({ argv: process.argv.slice(2), stdin, script: process.argv[1], installed }))
process.exit(Number(process.env.FAKE_EXIT ?? 0))
`
  )
  const pkg = (deps: Record<string, string>) =>
    JSON.stringify({ name: 'fake-soii', private: true, scripts: { postinstall: 'bun -e "require(\'fs\').writeFileSync(\'installed\', \'\')"' }, dependencies: deps })
  // A local package keeps bun.lock real (Bun writes none for zero dependencies) without going online.
  for (const local of ['dep', 'other']) {
    mkdirSync(join(dir, local), { recursive: true })
    writeFileSync(join(dir, local, 'package.json'), JSON.stringify({ name: local, version: '1.0.0' }))
  }
  writeFileSync(join(dir, 'package.json'), pkg({ dep: 'file:./dep' }))
  const lock = Bun.spawnSync(['bun', 'install', '--ignore-scripts'], { cwd: dir })
  if (lock.exitCode !== 0) throw new Error(lock.stderr.toString())
  writeFileSync(join(dir, 'package.json'), pkg({ dep: 'file:./dep', ...extraDeps }))
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ninstalled\n')
  const git = (...args: string[]) => {
    const r = Bun.spawnSync(['git', '-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args])
    if (r.exitCode !== 0) throw new Error(r.stderr.toString())
  }
  git('init', '-q', '-b', 'main')
  git('add', '.')
  git('commit', '-q', '-m', 'fake soii')
  git('branch', 'v9.9.9')
  return `file://${dir}`
}
const PS_NULL = fakePs('null')
const FAKE = fakeRepo('fake-soii')
/** package.json asks for a package bun.lock doesn't have: `--frozen-lockfile` fails, a plain `bun install` works. */
const STALE_LOCK = fakeRepo('fake-soii-stale-lock', { other: 'file:./other' })
/** package.json asks for a package that doesn't exist: every `bun install` fails. */
const BROKEN = fakeRepo('fake-soii-broken', { gone: 'file:./no-such-package' })

interface Run {
  code: number
  out: string
  err: string
  /** What the fake soii recorded, or null if it never ran. */
  soii: { argv: string[]; stdin: string; script: string; installed: boolean } | null
  /** Temporary clones the script left behind. */
  leftovers: string[]
}
let n = 0
function run(args: string[], opts: { path?: string; env?: Record<string, string>; stdin?: string; home?: string } = {}): Run {
  const id = `run${n++}`
  const tmp = join(root, `tmp-${id}`)
  mkdirSync(tmp)
  const fakeOut = join(root, `out-${id}.json`)
  const r = Bun.spawnSync(['/bin/bash', SCRIPT, ...args], {
    cwd: root,
    stdin: opts.stdin === undefined ? 'ignore' : new TextEncoder().encode(opts.stdin),
    env: {
      PATH: opts.path ?? ALL,
      HOME: opts.home ?? join(root, `home-${id}`),
      TMPDIR: tmp,
      SOII_CLONE_URL: FAKE,
      SOII_TTY: join(root, 'no-such-terminal'),
      FAKE_OUT: fakeOut,
      ...opts.env
    }
  })
  return {
    code: r.exitCode ?? -1,
    out: r.stdout.toString(),
    err: r.stderr.toString(),
    soii: existsSync(fakeOut) ? JSON.parse(readFileSync(fakeOut, 'utf8')) : null,
    leftovers: readdirSync(tmp)
  }
}

describe('install.sh', () => {
  test('a vault path runs `soii install <vault>` from a clone that is gone afterwards', () => {
    const r = run(['~/my-vault', '--no-service'])
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    expect(r.soii?.argv).toEqual(['install', '~/my-vault', '--no-service'])
    expect(r.soii?.script).toMatch(/soii-installer\.[^/]+\/soii\/bin\/soii\.ts$/)
    expect(r.leftovers).toEqual([])
  })

  test("soii's packages are installed in the clone before soii runs, so nothing loads from Bun's global cache", () => {
    const r = run(['--yes'])
    expect(r.code).toBe(0)
    expect(r.soii?.installed).toBe(true)
    expect(r.out).toContain("Installing soii's packages")
  })

  test("a lockfile this Bun can't use falls back to a plain install, as `soii install` does", () => {
    const r = run(['--yes'], { env: { SOII_CLONE_URL: STALE_LOCK } })
    expect(r.code).toBe(0)
    expect(r.soii?.installed).toBe(true)
  })

  test('if the packages cannot be installed, it says so, soii never runs, and the clone is removed', () => {
    const r = run(['--yes'], { env: { SOII_CLONE_URL: BROKEN } })
    expect(r.code).toBe(1)
    expect(r.err).toContain("couldn't install soii's packages")
    expect(r.soii).toBeNull()
    expect(r.leftovers).toEqual([])
  })

  test('init as the first word runs init, and needs no terminal', () => {
    const r = run(['init', '~/my-vault', '--samples'])
    expect(r.code).toBe(0)
    expect(r.soii?.argv).toEqual(['init', '~/my-vault', '--samples'])
  })

  test('--yes never needs a terminal', () => {
    const r = run(['--yes'])
    expect(r.code).toBe(0)
    expect(r.soii?.argv).toEqual(['install', '--yes'])
  })

  test("soii's exit code is the script's, and the clone is still removed", () => {
    const r = run(['~/v', '--yes'], { env: { FAKE_EXIT: '3' } })
    expect(r.code).toBe(3)
    expect(r.leftovers).toEqual([])
  })

  test('SOII_REF picks the branch or tag to clone', () => {
    expect(run(['--yes'], { env: { SOII_REF: 'v9.9.9' } }).code).toBe(0)
    const bad = run(['--yes'], { env: { SOII_REF: 'no-such-ref' } })
    expect(bad.code).toBe(1)
    expect(bad.soii).toBeNull()
    expect(bad.leftovers).toEqual([])
  })

  describe('questions (a bare install)', () => {
    test('piped into bash with no keyboard, it stops and says how to go on', () => {
      const r = run([], { stdin: 'echo ignored' })
      expect(r.code).toBe(1)
      expect(r.err).toContain('no terminal to ask questions on')
      expect(r.err).toContain('--yes')
      expect(r.soii).toBeNull()
      expect(r.leftovers).toEqual([])
    })

    test('with a keyboard it reads the answers from there, not from the pipe', () => {
      const keyboard = join(root, 'keyboard.txt')
      writeFileSync(keyboard, 'new\nsoii-vault\n')
      const r = run([], { stdin: 'echo from the pipe', env: { SOII_TTY: keyboard } })
      expect(r.code).toBe(0)
      expect(r.soii?.argv).toEqual(['install'])
      expect(r.soii?.stdin).toBe('new\nsoii-vault\n')
    })
  })

  describe('the keyboard', () => {
    // Bun's readline hangs on the /dev/tty alias on macOS (and fails with "EINVAL: kqueue" on Bun 1.4), so soii is handed
    // the terminal's own device. `ps` names it; /dev/null is a character device that stands in for a real terminal here.
    test("soii reads the terminal's real device (not /dev/tty) when it is piped into bash", () => {
      const r = run([], { stdin: 'echo from the pipe', path: PS_NULL, env: { SOII_TTY: '' } })
      expect(r.err).toBe('')
      expect(r.code).toBe(0)
      expect(r.soii?.argv).toEqual(['install'])
      expect(r.soii?.stdin).toBe('')
    })

    test('SOII_TTY still names the keyboard explicitly', () => {
      const keyboard = join(root, 'keyboard2.txt')
      writeFileSync(keyboard, 'x\n')
      const r = run([], { stdin: 'echo from the pipe', path: PS_NULL, env: { SOII_TTY: keyboard } })
      expect(r.soii?.stdin).toBe('x\n')
    })
  })

  describe('prerequisites', () => {
    test('missing Bun: says so with the install command, and clones nothing', () => {
      const r = run(['--yes'], { path: NO_BUN })
      expect(r.code).toBe(1)
      expect(r.err).toContain('Bun is missing')
      expect(r.err).toContain('https://bun.sh/install')
      expect(r.soii).toBeNull()
      expect(r.leftovers).toEqual([])
    })

    test('Bun in ~/.bun/bin is found even when it is not on PATH', () => {
      const home = join(root, 'home-with-bun')
      mkdirSync(join(home, '.bun', 'bin'), { recursive: true })
      symlinkSync(which('bun')!, join(home, '.bun', 'bin', 'bun'))
      const r = run(['--yes'], { path: NO_BUN, home })
      expect(r.err).toBe('')
      expect(r.code).toBe(0)
      // This terminal doesn't have ~/.bun/bin on PATH yet, so the `soii` command it sets up isn't found here: say so last.
      expect(r.out.trimEnd().split('\n').pop()).toContain('new terminal')
    })

    test('no such note when Bun was already on PATH', () => {
      expect(run(['--yes']).out).not.toContain('new terminal')
    })

    test('a Bun older than soii needs: says which, and how to update, and clones nothing', () => {
      const r = run(['--yes'], { path: fakeBun('1.1.45') })
      expect(r.code).toBe(1)
      expect(r.err).toContain('Bun 1.1.45 is too old')
      expect(r.err).toContain('bun upgrade')
      expect(r.soii).toBeNull()
      expect(r.leftovers).toEqual([])
    })

    test('a new enough Bun passes the check, compared by number and not as text', () => {
      for (const version of ['1.2.0', '1.10.0', '2.0.1', '1.3.14-canary.1+abc']) {
        const r = run(['--yes'], { path: fakeBun(version) })
        expect(r.err).toBe('')
        expect(r.code).toBe(0)
      }
    })

    test('the Mac stand-in for git (no command line tools yet): says to run xcode-select, not to check the connection', () => {
      const r = run(['--yes'], { path: xcodeShimGit() })
      expect(r.code).toBe(1)
      expect(r.err).toContain('xcode-select --install')
      expect(r.err).not.toContain('online')
      expect(r.soii).toBeNull()
      expect(r.leftovers).toEqual([])
    })

    test('missing git: says so', () => {
      const r = run(['--yes'], { path: NO_GIT })
      expect(r.code).toBe(1)
      expect(r.err).toContain('git is missing')
    })

    test("a repo git can't reach: says to check the connection, and how a private fork signs in", () => {
      const r = run(['--yes'], { env: { SOII_CLONE_URL: `file://${join(root, 'does-not-exist')}` } })
      expect(r.code).toBe(1)
      expect(r.err).toContain('online')
      expect(r.err).toContain('gh auth setup-git')
      expect(r.err).not.toMatch(/is private/)
      expect(r.soii).toBeNull()
    })

    test('every problem is listed in one run', () => {
      const r = run(['--yes'], { path: NO_BUN, env: { SOII_CLONE_URL: `file://${join(root, 'does-not-exist')}` } })
      expect(r.err).toContain('Bun is missing')
      expect(r.err).toContain('online')
    })
  })

  test('is executable, and parses under the bash that ships with macOS (3.2) rules', () => {
    chmodSync(SCRIPT, 0o755)
    expect(Bun.spawnSync(['/bin/bash', '-n', SCRIPT]).exitCode).toBe(0)
  })
})
