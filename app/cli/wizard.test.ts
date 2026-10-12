// app/cli/wizard.test.ts
// The install wizard (D108), driven by scripted answers. The install itself is faked (it would clone soii from GitHub);
// the git work, the folder scan, the copy and the properties step run for real in temp folders.
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Flags } from './args'
import { realCtx, type Ctx } from './context'
import { main } from './main'
import { Aborted, readlinePrompter, scriptedPrompter } from './prompt'
import { runWizard, type WizardDeps } from './wizard'
import { Readable, Writable } from 'node:stream'

const ROOT = join(import.meta.dir, '..', '..')
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
beforeAll(() => {
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' })
})

const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-wizard-'))
  dirs.push(d)
  return d
}
const flags = (f: Partial<Flags> = {}): Flags => ({ follow: false, empty: false, noService: false, help: false, json: false, ...f })
const put = (root: string, rel: string, body = 'x\n') => {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), body)
}
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

interface Rig {
  ctx: Ctx
  out: string[]
  err: string[]
  asked: string[]
  calls: { init: { dir: string; flags: Flags }[]; install: { dir: string; flags: Flags }[]; open: number }
  deps: WizardDeps
  home: string
}

/** A ctx whose machine has bun and GitHub access (or not, via `missing`), and answers from a list. */
function rig(answers: string[], o: { platform?: NodeJS.Platform; cwd?: string; missing?: 'bun' | 'git' | 'github' } = {}): Rig {
  const home = tmp()
  const out: string[] = []
  const err: string[] = []
  const asked: string[] = []
  const real = realCtx()
  const ctx: Ctx = {
    ...real,
    home,
    env: { ...process.env, HOME: home },
    platform: o.platform ?? 'linux',
    cwd: o.cwd ?? home,
    out: m => out.push(m),
    err: m => err.push(m),
    interactive: true,
    prompter: () => scriptedPrompter(answers, asked),
    exec: async (cmd, args, opts) => {
      if (cmd === 'bun') return o.missing === 'bun' ? { code: 127, out: '' } : { code: 0, out: '1.3.0' }
      if (cmd === 'git' && args[0] === '--version') return o.missing === 'git' ? { code: 127, out: '' } : { code: 0, out: 'git version 2.50.0' }
      if (cmd === 'git' && args[0] === 'ls-remote') return o.missing === 'github' ? { code: 128, out: 'denied' } : { code: 0, out: '' }
      return real.exec(cmd, args, opts)
    }
  }
  const calls: Rig['calls'] = { init: [], install: [], open: 0 }
  const deps: WizardDeps = {
    // What init does apart from fetching soii: make the folder, let the hook copy notes in, start git and commit.
    init: async (c, dir, f, hook) => {
      calls.init.push({ dir, flags: f })
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'soii.config.yml'), 'title: x\n')
      if (hook) await hook(dir)
      git(dir, 'init', '-q', '-b', 'main')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'Initial vault from the soii template')
      return 0
    },
    install: async (c, dir, f) => {
      calls.install.push({ dir: dir ?? '', flags: f })
      return 0
    },
    open: async () => {
      calls.open++
      return 0
    }
  }
  return { ctx, out, err, asked, calls, deps, home }
}

const said = (r: Rig) => r.out.join('\n')

describe('new vault', () => {
  test('happy path: folder and name typed in, sample notes, recap, one yes', async () => {
    const parent = tmp()
    const r = rig(['new', parent, 'my-notes', 'y', 'y', 'y', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    const dest = join(parent, 'my-notes')
    expect(r.calls.init).toHaveLength(1)
    expect(r.calls.init[0].dir).toBe(dest)
    expect(r.calls.init[0].flags.empty).toBe(false)
    expect(r.calls.open).toBe(1)
    expect(said(r)).toContain(`New vault   ${dest} (with sample notes)`)
    expect(r.asked.at(-1)).toBe('Go ahead? [y/N] ')
    expect(existsSync(dest)).toBe(true)
  })

  test('Enter takes the defaults: folder ~, name soii-vault, samples yes, open yes, new vault', async () => {
    const r = rig(['', '', '', 'y', '', '', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(r.calls.init[0].dir).toBe(join(r.home, 'soii-vault'))
    expect(r.calls.init[0].flags.empty).toBe(false)
    expect(r.calls.open).toBe(1)
  })

  test('no sample notes means an empty vault', async () => {
    const parent = tmp()
    const r = rig(['new', parent, 'v', 'y', 'n', 'n', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(r.calls.init[0].flags.empty).toBe(true)
    expect(r.calls.open).toBe(0)
  })

  test('a folder that has files in it is refused and asked again; an empty one is fine', async () => {
    const parent = tmp()
    put(parent, 'taken/keep.md')
    mkdirSync(join(parent, 'empty'))
    const r = rig(['new', parent, 'taken', parent, 'empty', 'y', 'n', 'n', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(said(r)).toContain('already exists and has files in it')
    expect(r.calls.init[0].dir).toBe(join(parent, 'empty'))
    expect(readdirSync(join(parent, 'taken'))).toEqual(['keep.md'])
  })

  test('a name with a slash, and a place inside the soii folder, are asked again', async () => {
    const parent = tmp()
    const r = rig(['new', parent, 'a/b', ROOT, 'inside', parent, 'ok', 'y', 'n', 'n', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(said(r)).toContain('can not contain slashes')
    expect(said(r)).toContain('inside the soii program folder')
    expect(r.calls.init[0].dir).toBe(join(parent, 'ok'))
  })

  test('answering no to "Is that right?" asks for the folder and name again', async () => {
    const parent = tmp()
    const r = rig(['new', parent, 'first', 'n', parent, 'second', 'y', 'n', 'n', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(r.calls.init[0].dir).toBe(join(parent, 'second'))
  })

  test('start at login is asked on a Mac, and "no" is passed on; the others stay at login', async () => {
    const parent = tmp()
    const no = rig(['new', parent, 'a', 'y', 'n', 'n', 'n', 'y'], { platform: 'darwin' })
    expect(await runWizard(no.ctx, flags(), no.deps, no.ctx.prompter())).toBe(0)
    expect(no.calls.init[0].flags.boot).toBe(false)
    expect(said(no)).toContain('soii start')
    const yes = rig(['new', parent, 'b', 'y', 'n', 'y', 'n', 'y'], { platform: 'darwin' })
    expect(await runWizard(yes.ctx, flags(), yes.deps, yes.ctx.prompter())).toBe(0)
    expect(yes.calls.init[0].flags.boot).toBe(true)
    // not a Mac: no question, boot left alone
    const linux = rig(['new', parent, 'c', 'y', 'n', 'n', 'y'])
    expect(await runWizard(linux.ctx, flags(), linux.deps, linux.ctx.prompter())).toBe(0)
    expect(linux.calls.init[0].flags.boot).toBeUndefined()
    expect(linux.asked.some(q => q.includes('log in'))).toBe(false)
  })

  test('--no-service is respected: no login question, no browser question, flag passed on, nothing opened', async () => {
    const parent = tmp()
    const r = rig(['new', parent, 'quiet', 'y', 'n', 'y'], { platform: 'darwin' })
    expect(await runWizard(r.ctx, flags({ noService: true }), r.deps, r.ctx.prompter())).toBe(0)
    expect(r.asked.some(q => q.includes('log in') || q.includes('browser'))).toBe(false)
    expect(r.calls.init[0].flags.noService).toBe(true)
    expect(r.calls.open).toBe(0)
    expect(said(r)).toContain('--no-service')
  })
})

describe('existing vault', () => {
  /** A messy vault: no frontmatter anywhere except one typed book, a People folder and a Reading folder. */
  function messy(): string {
    const v = join(tmp(), 'old-notes')
    put(v, 'Reading/Dune — Frank Herbert.md', '---\ntype: book\n---\nGreat.\n')
    put(v, 'People/Ana.md', 'Met at the fair.\n')
    put(v, 'People/Bo.md', 'Neighbour.\n')
    put(v, 'People/Cy.md', 'Cousin.\n')
    put(v, 'Journal/2026-01-01.md', '# Day\n')
    put(v, '.obsidian/app.json', '{}')
    return v
  }
  const tree = (root: string, rel = ''): string[] =>
    readdirSync(join(root, rel), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? tree(root, join(rel, e.name)) : [join(rel, e.name)])).sort()
  const personNumber = String(['book', 'audiobook', 'movie', 'documentary', 'video', 'research', 'article', 'recipe', 'video-log', 'person'].indexOf('person') + 1)

  test('in place: starts git, fills properties, types a folder, merges after a yes', async () => {
    const v = messy()
    // existing, path, place, git yes, fill yes, People → person, Journal → skip, open no, go yes, merge yes
    const r = rig(['existing', v, 'place', 'y', 'y', personNumber, 's', 'n', 'y', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(r.calls.init).toHaveLength(0)
    expect(r.calls.install).toHaveLength(1)
    expect(r.calls.install[0].dir).toBe(v)
    expect(said(r)).toContain('Checked 5 notes:')
    expect(existsSync(join(v, '.git'))).toBe(true)
    expect(git(v, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(git(v, 'branch', '--list', 'soii/*')).toBe('')
    expect(git(v, 'log', '--format=%s').split('\n')[0]).toContain('merge soii/setup')
    expect(readFileSync(join(v, 'People/Ana.md'), 'utf8')).toContain('type: person')
    expect(readFileSync(join(v, 'People/Ana.md'), 'utf8')).toContain('Met at the fair.')
    expect(readFileSync(join(v, 'Reading/Dune — Frank Herbert.md'), 'utf8')).toContain('author: Frank Herbert')
    expect(readFileSync(join(v, 'Journal/2026-01-01.md'), 'utf8')).toBe('# Day\n')
    expect(git(v, 'status', '--porcelain')).toBe('')
  })

  test('copy: the old vault is never written to; notes arrive in the new one', async () => {
    const v = messy()
    const before = tree(v)
    const bodies = before.map(f => readFileSync(join(v, f), 'utf8'))
    const parent = tmp()
    // existing, path, copy, new folder, name, ok, fill no, People → person, Journal skip, open no, go yes, merge yes
    const r = rig(['existing', v, 'copy', parent, 'fresh', 'y', 'n', personNumber, 's', 'n', 'y', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    const dest = join(parent, 'fresh')
    expect(r.calls.init[0].dir).toBe(dest)
    expect(r.calls.init[0].flags.empty).toBe(true)
    expect(tree(v)).toEqual(before)
    expect(before.map(f => readFileSync(join(v, f), 'utf8'))).toEqual(bodies)
    expect(existsSync(join(v, '.git'))).toBe(false)
    expect(readFileSync(join(dest, 'People/Bo.md'), 'utf8')).toContain('type: person')
    // fill said no: only the type line was added, no empty properties
    expect(readFileSync(join(dest, 'People/Bo.md'), 'utf8')).not.toContain('relationship')
    expect(readFileSync(join(dest, 'Reading/Dune — Frank Herbert.md'), 'utf8')).not.toContain('author')
    expect(existsSync(join(dest, '.obsidian'))).toBe(false)
  })

  test('declining the merge leaves the branch for review and the vault on main untouched', async () => {
    const v = messy()
    const r = rig(['existing', v, 'place', 'y', 'y', personNumber, 's', 'n', 'y', 'n'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(git(v, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(git(v, 'branch', '--list', 'soii/*')).toContain('soii/setup')
    expect(readFileSync(join(v, 'People/Ana.md'), 'utf8')).toBe('Met at the fair.\n')
    expect(said(r)).toContain('Not merged')
  })

  test('a path that is not a folder, or has no notes, is asked again', async () => {
    const v = messy()
    const empty = tmp()
    const parent = tmp()
    const r = rig(['existing', join(tmp(), 'nope'), empty, v, 'copy', parent, 'x', 'y', 'n', 's', 's', 'n', 'y', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(said(r)).toContain('is not a folder')
    expect(said(r)).toContain('can not find any Markdown')
    expect(r.calls.init[0].dir).toBe(join(parent, 'x'))
  })

  test('the copy target must be a new or empty folder too', async () => {
    const v = messy()
    const parent = tmp()
    put(parent, 'busy/a.md')
    const r = rig(['existing', v, 'copy', parent, 'busy', parent, 'free', 'y', 'n', 's', 's', 'n', 'y', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(said(r)).toContain('already exists and has files in it')
    expect(r.calls.init[0].dir).toBe(join(parent, 'free'))
  })

  test('uncommitted changes in a vault that is already a repo: notes are left alone, install still happens', async () => {
    const v = messy()
    git(v, 'init', '-q', '-b', 'main')
    git(v, 'add', '-A')
    git(v, 'commit', '-q', '-m', 'first')
    put(v, 'People/Ana.md', 'Edited, not committed.\n')
    // existing, path, place, then no questions about notes; open no, go yes
    const r = rig(['existing', v, 'place', 'n', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(said(r)).toContain('not committed yet')
    expect(r.calls.install).toHaveLength(1)
    expect(readFileSync(join(v, 'People/Ana.md'), 'utf8')).toBe('Edited, not committed.\n')
    expect(git(v, 'branch', '--list', 'soii/*')).toBe('')
  })

  test('in place with "no" to git: install, and no properties step', async () => {
    const v = messy()
    const r = rig(['existing', v, 'place', 'n', 'n', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(existsSync(join(v, '.git'))).toBe(false)
    expect(r.calls.install).toHaveLength(1)
    expect(said(r)).toContain('they need git')
    expect(readFileSync(join(v, 'People/Ana.md'), 'utf8')).toBe('Met at the fair.\n')
  })

  test('from inside a vault that already runs soii, Enter means: existing, this folder, in place', async () => {
    const v = messy()
    put(v, '.soii/package.json', '{}')
    git(v, 'init', '-q', '-b', 'main')
    git(v, 'add', '-A')
    git(v, 'commit', '-q', '-m', 'first')
    // existing, this folder, in place; fill no, skip the folder questions with q, open no, go yes
    const r = rig(['', '', '', 'n', 'q', 'n', 'y'], { cwd: v })
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(r.calls.install[0].dir).toBe(v)
    expect(r.calls.init).toHaveLength(0)
  })
})

describe('stopping', () => {
  test('the end of the input after some answers writes nothing and says so', async () => {
    const parent = tmp()
    const r = rig(['new', parent, 'never', 'y'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(1)
    expect(said(r)).toContain('Nothing was written')
    expect(r.calls.init).toHaveLength(0)
    expect(existsSync(join(parent, 'never'))).toBe(false)
  })

  test('no input at all stops before anything', async () => {
    const r = rig([])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(1)
    expect(r.calls.init).toHaveLength(0)
  })

  test('"n" at the final question stops with nothing written, and the default is no', async () => {
    const parent = tmp()
    const r = rig(['new', parent, 'nope', 'y', 'y', 'y', 'n'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(0)
    expect(r.calls.init).toHaveLength(0)
    expect(existsSync(join(parent, 'nope'))).toBe(false)
    const d = rig(['new', parent, 'nope', 'y', 'y', 'y', ''])
    expect(await runWizard(d.ctx, flags(), d.deps, d.ctx.prompter())).toBe(0)
    expect(d.calls.init).toHaveLength(0)
  })

  test('a copy that is cancelled never touches either vault', async () => {
    const v = join(tmp(), 'old')
    put(v, 'a.md', 'a\n')
    const parent = tmp()
    const r = rig(['existing', v, 'copy', parent, 'new', 'y', 'n'])
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(1)
    expect(readdirSync(v)).toEqual(['a.md'])
    expect(readdirSync(parent)).toEqual([])
  })
})

describe('the machine', () => {
  test('missing bun: prints the install command and stops without asking anything', async () => {
    const r = rig(['new'], { missing: 'bun' })
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(1)
    expect(r.err.join('\n')).toContain('curl -fsSL https://bun.sh/install | bash')
    expect(r.asked).toEqual([])
  })

  test('no GitHub access: prints gh auth login && gh auth setup-git and stops', async () => {
    const r = rig(['new'], { missing: 'github' })
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(1)
    expect(r.err.join('\n')).toContain('gh auth login && gh auth setup-git')
    expect(r.asked).toEqual([])
  })

  test('everything missing is listed in one go', async () => {
    const r = rig([], { missing: 'git' })
    expect(await runWizard(r.ctx, flags(), r.deps, r.ctx.prompter())).toBe(1)
    expect(r.err.join('\n')).toContain('xcode-select --install')
  })
})

describe('when it runs (main)', () => {
  const quiet = (r: Rig, over: Partial<Ctx> = {}): Ctx => ({
    ...r.ctx,
    // the plain install must never reach GitHub from a test
    exec: async (cmd, args, opts) => (cmd === 'git' && args[0] === 'clone' ? { code: 128, out: 'fatal: no network in tests' } : r.ctx.exec(cmd, args, opts)),
    stream: async () => 1,
    ...over
  })

  test('a bare `soii install` in a terminal runs the wizard', async () => {
    const r = rig([])
    expect(await main(['install'], quiet(r))).toBe(1)
    expect(said(r)).toContain('Welcome to soii')
  })

  test('inside the soii clone, install runs the wizard instead of installing into the clone', async () => {
    const r = rig([], { cwd: ROOT })
    expect(await main(['install'], quiet(r))).toBe(1)
    expect(said(r)).toContain('Welcome to soii')
    expect(said(r)).not.toContain('Installing soii')
    expect(existsSync(join(ROOT, '.soii'))).toBe(false)
  })

  test('without a terminal, install does what it always did', async () => {
    const dir = tmp()
    const r = rig([], { cwd: dir })
    expect(await main(['install'], quiet(r, { interactive: false }))).toBe(1)
    expect(said(r)).not.toContain('Welcome to soii')
    expect(said(r)).toContain('Installing soii')
    expect(r.asked).toEqual([])
  })

  test('--yes, or a vault path, keep the plain install even in a terminal', async () => {
    const dir = tmp()
    const a = rig([], { cwd: dir })
    expect(await main(['install', '--yes'], quiet(a))).toBe(1)
    expect(said(a)).toContain('Installing soii')
    expect(said(a)).not.toContain('Welcome to soii')
    const b = rig([], { cwd: tmp() })
    expect(await main(['install', dir], quiet(b))).toBe(1)
    expect(said(b)).toContain('Installing soii')
  })

  test('`soii setup` always asks, even when the answers come from a pipe', async () => {
    const r = rig([])
    expect(await main(['setup'], quiet(r, { interactive: false }))).toBe(1)
    expect(said(r)).toContain('Welcome to soii')
  })

  test('`soii setup` takes no vault path and passes --no-service on', async () => {
    const r = rig([])
    expect(await main(['setup', 'somewhere'], quiet(r))).toBe(2)
    const parent = tmp()
    const s = rig(['new', parent, 'v', 'y', 'n', 'y'])
    // fake init/install can't be injected through main, so stop at the final question: the recap shows the flag
    const ctx = quiet(s, { prompter: () => scriptedPrompter(['new', parent, 'v', 'y', 'n', 'n'], s.asked) })
    expect(await main(['setup', '--no-service'], ctx)).toBe(0)
    expect(said(s)).toContain('--no-service')
  })
})

describe('the prompt layer', () => {
  const run = async (input: string, questions: string[]): Promise<{ answers: string[]; aborted: boolean; shown: string }> => {
    let shown = ''
    const output = new Writable({
      write(chunk, _enc, done) {
        shown += chunk.toString()
        done()
      }
    })
    const p = readlinePrompter(Readable.from([input]), output)
    const answers: string[] = []
    let aborted = false
    try {
      for (const q of questions) answers.push(await p.ask(q))
    } catch (err) {
      aborted = err instanceof Aborted
      if (!aborted) throw err
    } finally {
      p.close()
    }
    return { answers, aborted, shown }
  }

  test('piped lines answer in order, trimmed, and the transcript echoes them', async () => {
    const r = await run('  one \ntwo\n', ['a? ', 'b? '])
    expect(r.answers).toEqual(['one', 'two'])
    expect(r.aborted).toBe(false)
    expect(r.shown).toBe('a?   one \nb? two\n')
  })

  test('the end of the input is an abort, not an empty answer', async () => {
    const r = await run('only\n', ['a? ', 'b? '])
    expect(r.answers).toEqual(['only'])
    expect(r.aborted).toBe(true)
  })

  test('an empty line is an empty answer (the default)', async () => {
    const r = await run('\nx\n', ['a? ', 'b? '])
    expect(r.answers).toEqual(['', 'x'])
  })
})
