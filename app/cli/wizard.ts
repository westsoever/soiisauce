// app/cli/wizard.ts
// `soii install` (or `soii setup`) with no vault named, in a terminal: a few plain questions, a recap, one final
// yes, then the same install as always. For people who don't use Claude Code (D108). Nothing is written before the
// final "Go ahead?"; Ctrl-C or the end of the input stops with nothing changed.
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { normaliseVault, type NormaliseReport } from '../../scripts/vault-normalise'
import { importVault } from '../../scripts/vault-import'
import type { Flags } from './args'
import { remoteUrl } from './checkout'
import * as commands from './commands'
import type { Ctx } from './context'
import { Aborted, askYesNo, type Prompter } from './prompt'
import { countNotes, scanVault, summariseVault, TYPE_CHOICES, type FolderStat } from './vault-scan'

export interface WizardDeps {
  init: typeof commands.init
  install: typeof commands.install
  open: typeof commands.open
}
const realDeps: WizardDeps = { init: commands.init, install: commands.install, open: commands.open }

type Mode = 'new' | 'place' | 'copy'

interface Plan {
  mode: Mode
  /** Where soii will live. */
  vault: string
  /** The vault the notes come from (copy mode); never written to. */
  source?: string
  samples: boolean
  /** Start a git repository in an existing vault that has none. */
  gitInit: boolean
  /** undefined: not asked (--no-service, or not macOS). */
  boot?: boolean
  fill: boolean
  typeMap: [string, string][]
  open: boolean
}

const expandHome = (ctx: Ctx, p: string) => (p === '~' ? ctx.home : p.startsWith('~/') ? join(ctx.home, p.slice(2)) : p)
const where = (ctx: Ctx, p: string) => (p === ctx.home ? '~' : p.startsWith(ctx.home + sep) ? `~/${p.slice(ctx.home.length + 1)}` : p)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
const real = (p: string) => {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}
/** Inside the soii program folder (the clone, or a vault's .soii/soii): notes never belong there. */
const insideSoii = (ctx: Ctx, dir: string) => {
  const root = real(ctx.pkgRoot)
  const d = real(dir)
  return d === root || d.startsWith(root + sep)
}
const looksLikeVault = (dir: string) => existsSync(join(dir, '.obsidian')) || existsSync(join(dir, '.soii', 'package.json'))
const isSoiiVault = (dir: string) => existsSync(join(dir, '.soii', 'package.json'))

// ---- the machine ----

async function prerequisites(ctx: Ctx): Promise<boolean> {
  ctx.out('First, a quick look at this computer.')
  const problems: string[] = []
  const bun = await ctx.exec('bun', ['--version'])
  ctx.out(`  bun: ${bun.code === 0 ? bun.out.split('\n')[0] : 'not found'}`)
  if (bun.code !== 0) problems.push('Bun runs soii and is not installed (or not on your PATH). Install it with:\n    curl -fsSL https://bun.sh/install | bash\n  then open a new terminal window and start again.')
  const git = await ctx.exec('git', ['--version'])
  ctx.out(`  git: ${git.code === 0 ? git.out.split('\n')[0] : 'not found'}`)
  if (git.code !== 0) problems.push('git keeps your notes safe and fetches soii, and is not installed. On a Mac run:\n    xcode-select --install\n  (elsewhere: https://git-scm.com/downloads), then start again.')
  else {
    const remote = await ctx.exec('git', ['ls-remote', '--tags', remoteUrl(ctx)], { timeoutMs: 30_000 })
    ctx.out(`  GitHub access to soii: ${remote.code === 0 ? 'ok' : 'cannot read it'}`)
    if (remote.code !== 0) problems.push('git cannot read the soii repo (it is private). Sign in to GitHub once with:\n    gh auth login && gh auth setup-git\n  (the `gh` tool is at https://cli.github.com, or `brew install gh`), then start again.')
  }
  if (!problems.length) return true
  ctx.err(`\nSomething is missing, so I stopped before changing anything:\n\n${problems.map(p => `- ${p}`).join('\n\n')}`)
  return false
}

// ---- the questions ----

async function askNewFolder(ctx: Ctx, p: Prompter, defaultName: string): Promise<string> {
  for (;;) {
    const parent = (await p.ask('Which folder should it go in? [~] ')) || '~'
    const name = (await p.ask(`What should the vault be called? [${defaultName}] `)) || defaultName
    if (/[\\/]/.test(name) || name === '.' || name === '..') {
      ctx.out('A name can not contain slashes. Pick a plain name like soii-vault.')
      continue
    }
    const full = resolve(ctx.cwd, expandHome(ctx, parent), name)
    let problem = ''
    if (insideSoii(ctx, full)) problem = 'That is inside the soii program folder. Pick somewhere else, such as your home folder.'
    else if (existsSync(full) && !isDir(full)) problem = `${where(ctx, full)} is a file, not a folder.`
    else if (existsSync(full) && readdirSync(full).filter(f => f !== '.DS_Store').length > 0) problem = `${where(ctx, full)} already exists and has files in it. A new vault needs a folder that does not exist yet, or an empty one.`
    else if (existsSync(resolve(full, '..')) && !isDir(resolve(full, '..'))) problem = `${where(ctx, resolve(full, '..'))} is a file, not a folder.`
    if (problem) {
      ctx.out(`${problem}\nLet's try again.`)
      continue
    }
    ctx.out(`The vault will be created here:\n  ${full}`)
    if (await askYesNo(p, 'Is that right?', true)) return full
  }
}

async function askExistingPath(ctx: Ctx, p: Prompter): Promise<string> {
  const guess = looksLikeVault(ctx.cwd) && !insideSoii(ctx, ctx.cwd) ? ctx.cwd : ''
  for (;;) {
    const raw = await p.ask(`Where is your vault? (the folder that holds your notes)${guess ? ` [${where(ctx, guess)}]` : ''} `)
    const chosen = raw || guess
    if (!chosen) continue
    const dir = resolve(ctx.cwd, expandHome(ctx, chosen))
    if (!isDir(dir)) ctx.out(`${dir} is not a folder. Check the spelling, or drag the folder into this window to paste its path.`)
    else if (insideSoii(ctx, dir)) ctx.out('That is the soii program folder, not a vault of notes.')
    else if (countNotes(dir) === 0) ctx.out(`I can not find any Markdown (.md) notes in ${dir}. Is it the right folder?`)
    else return dir
  }
}

async function askMode(ctx: Ctx, p: Prompter): Promise<'new' | 'existing'> {
  const fallback = looksLikeVault(ctx.cwd) && !insideSoii(ctx, ctx.cwd) ? 'existing' : 'new'
  ctx.out('\nDo you want to start a new vault, or use notes you already have?\n  1) new       a fresh vault, with an optional set of sample notes\n  2) existing  a vault you already keep (Obsidian or plain Markdown files)')
  for (;;) {
    const a = (await p.ask(`Choose [${fallback}] `)).toLowerCase()
    if (a === '') return fallback
    if (['1', 'n', 'new'].includes(a)) return 'new'
    if (['2', 'e', 'existing'].includes(a)) return 'existing'
    ctx.out('Please answer new or existing (or 1 or 2).')
  }
}

async function askPlaceOrCopy(ctx: Ctx, p: Prompter, source: string): Promise<'place' | 'copy'> {
  const fallback = isSoiiVault(source) ? 'place' : 'copy'
  ctx.out(
    '\nHow should soii set up?\n' +
      '  1) place  In place: add soii to this vault. Your notes are not moved or renamed. soii adds a .soii/ folder and a .claude/skills/ folder.\n' +
      '  2) copy   Copy your notes into a new soii vault. This vault stays exactly as it is, as a backup.'
  )
  for (;;) {
    const a = (await p.ask(`Choose [${fallback}] `)).toLowerCase()
    if (a === '') return fallback
    if (['1', 'p', 'place', 'in place', 'inplace', 'in'].includes(a)) return 'place'
    if (['2', 'c', 'copy'].includes(a)) return 'copy'
    ctx.out('Please answer place or copy (or 1 or 2).')
  }
}

async function repoState(ctx: Ctx, dir: string): Promise<'clean' | 'dirty' | 'none'> {
  if (!existsSync(join(dir, '.git'))) return 'none'
  const head = await ctx.exec('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: dir })
  if (head.code !== 0) return 'dirty'
  const status = await ctx.exec('git', ['status', '--porcelain'], { cwd: dir })
  return status.out.trim() ? 'dirty' : 'clean'
}

async function askFolderTypes(ctx: Ctx, p: Prompter, folders: FolderStat[]): Promise<[string, string][]> {
  ctx.out('\nSome folders hold notes with no "type". The type tells soii where a note belongs (Library, People, Goals…).')
  ctx.out(folders.map(f => `  ${f.path}  ${plural(f.notes, 'note')}, ${f.untyped} without a type`).join('\n'))
  ctx.out('\nFor each folder, pick what its notes are, or press Enter to leave it alone. Your notes are only given a "type:" line when they have none; nothing else in them changes.')
  const list = TYPE_CHOICES.map((t, i) => `  ${String(i + 1).padStart(2)}) ${t.type}${t.hint ? `  (${t.hint})` : ''}`).join('\n')
  const map: [string, string][] = []
  for (const [i, f] of folders.entries()) {
    if (i === 0) ctx.out(`\nTypes:\n${list}\n  s) skip this folder (or just press Enter)\n  q) skip all the rest`)
    for (;;) {
      const a = (await p.ask(`${f.path} (${plural(f.notes, 'note')}): type number, or s to skip [s] `)).toLowerCase()
      if (a === '' || a === 's' || a === 'skip') break
      if (a === 'q') return map
      const byNumber = /^\d+$/.test(a) ? TYPE_CHOICES[Number(a) - 1] : undefined
      const byName = TYPE_CHOICES.find(t => t.type === a)
      const choice = byNumber ?? byName
      if (choice) {
        map.push([f.path, choice.type])
        break
      }
      ctx.out(`Please type a number from 1 to ${TYPE_CHOICES.length}, or s.`)
    }
  }
  return map
}

async function ask(ctx: Ctx, p: Prompter, flags: Flags): Promise<Plan> {
  const interactiveService = !flags.noService
  const kind = await askMode(ctx, p)
  const plan: Plan = { mode: 'new', vault: '', samples: true, gitInit: false, fill: false, typeMap: [], open: false }

  if (kind === 'new') {
    plan.vault = await askNewFolder(ctx, p, 'soii-vault')
    plan.samples = await askYesNo(p, 'Add a few sample notes (made-up books, people and goals) so you can see what soii looks like?', true)
  } else {
    const source = await askExistingPath(ctx, p)
    plan.mode = await askPlaceOrCopy(ctx, p, source)
    if (plan.mode === 'place') {
      plan.vault = source
      if (!existsSync(join(source, '.git'))) {
        plan.gitInit = await askYesNo(p, "\nThis vault is not a git repository yet. soii saves its edits as git commits, and git is the safety net for anything it changes. Start one (your notes are committed as they are)?", true)
      }
    } else {
      plan.source = source
      ctx.out('\nThe copy needs a place of its own.')
      plan.vault = await askNewFolder(ctx, p, 'soii-vault')
      plan.samples = false
    }
  }

  if (ctx.platform === 'darwin' && interactiveService) {
    plan.boot = await askYesNo(p, '\nStart soii automatically when you log in?', true)
    if (!plan.boot) ctx.out('OK. soii will run now, but it will not start by itself after you log in again. Whenever you want it, type `soii start` in a terminal.')
  }

  if (kind === 'existing') {
    const source = plan.source ?? plan.vault
    ctx.out('\nLooking through your notes (nothing is changed)…')
    const summary = await summariseVault(source)
    ctx.out(summary.line)
    const state = plan.mode === 'place' ? (plan.gitInit ? 'clean' : await repoState(ctx, plan.vault)) : 'clean'
    if (state !== 'clean') {
      ctx.out(
        state === 'none'
          ? 'I will skip adding properties and types: they need git, as the safety net. You can start one later and run the install again.'
          : 'This vault has changes that are not committed yet, so I will leave your notes alone. Commit or stash them, then run this again to add properties and types.'
      )
    } else {
      if (summary.missingProps > 0) {
        ctx.out('\nNotes that already have a type (book, person…) can get the properties soii shows for it, as empty keys like `rating:`, plus a few values it can work out safely (an author from a file name like "Dune — Frank Herbert", `created` from git). Nothing you wrote is ever replaced. It happens on a separate git branch called soii/setup, and you see the numbers and approve before it is merged.')
        plan.fill = await askYesNo(p, `Fill in the missing properties on ${plural(summary.missingProps, 'note')}?`, true)
      }
      const scan = scanVault(source)
      if (scan.folders.length > 0) plan.typeMap = await askFolderTypes(ctx, p, scan.folders)
    }
  }

  if (interactiveService) plan.open = await askYesNo(p, '\nOpen soii in your browser when it is ready?', true)
  return plan
}

// ---- the recap ----

function recap(ctx: Ctx, plan: Plan, flags: Flags): string {
  const lines: string[] = ['', 'Here is what I will do:', '']
  const row = (k: string, v: string) => lines.push(`  ${k.padEnd(12)}${v}`)
  if (plan.mode === 'new') row('New vault', `${plan.vault}${plan.samples ? ' (with sample notes)' : ' (empty: just the folders and templates)'}`)
  else if (plan.mode === 'copy') {
    row('Copy notes', `from ${plan.source}`)
    row('into', `${plan.vault}, a new soii vault. ${plan.source} is not touched.`)
  } else row('Existing', `${plan.vault}, set up in place. Your notes are not moved or renamed.`)
  if (plan.mode !== 'place') row('Git', 'start a repository and make the first commit')
  else if (plan.gitInit) row('Git', 'start a repository and commit your notes as they are')
  row('soii', flags.from ? `release ${flags.from}` : 'install the release this copy of soii is at, build it, and add the soii skills')
  if (flags.noService) row('Service', 'none (--no-service): installed in the vault only, nothing is started')
  else {
    row('Command', 'put the `soii` command on your PATH')
    if (plan.boot === undefined) row('Service', 'run soii in the background')
    else row('Service', plan.boot ? 'run soii in the background and start it at login' : 'run soii in the background now, not at login (`soii start` later)')
  }
  if (plan.typeMap.length) row('Types', plan.typeMap.map(([f, t]) => `${f} → ${t}`).join(', '))
  if (plan.fill || plan.typeMap.length) row('Notes', `${[plan.typeMap.length ? 'add the types above' : '', plan.fill ? 'fill in missing properties' : ''].filter(Boolean).join(' and ')}, on a branch soii/setup; you approve the merge`)
  if (plan.open) row('Browser', `open http://localhost:${flags.port ?? 5011}`)
  lines.push('', 'No note is deleted, moved or renamed.', '')
  return lines.join('\n')
}

// ---- doing it ----

async function git(ctx: Ctx, dir: string, args: string[]) {
  return ctx.exec('git', args, { cwd: dir })
}

async function startRepo(ctx: Ctx, dir: string): Promise<boolean> {
  const init = await git(ctx, dir, ['init', '-q', '-b', 'main'])
  if (init.code !== 0) {
    ctx.err(`soii: git init failed: ${init.out.split('\n')[0]}`)
    return false
  }
  await git(ctx, dir, ['add', '-A', '--', '.', ':(exclude).soii'])
  const commit = await git(ctx, dir, ['commit', '-q', '-m', 'Initial commit of the vault, before soii'])
  ctx.out(commit.code === 0 ? 'Started a git repository and committed your notes as they are.' : `Started a git repository. The first commit did not happen (${commit.out.split('\n')[0]}); commit your notes yourself.`)
  return true
}

function describe(report: NormaliseReport, fill: boolean): string[] {
  const count = (how: string) => report.changed.flatMap(n => n.changes).filter(c => c.how === how).length
  const lines = [`Changed ${report.changed.length} of ${report.notes} notes:`]
  if (count('mapped')) lines.push(`  ${plural(count('mapped'), 'note')} got a type`)
  if (fill && count('empty')) lines.push(`  ${plural(count('empty'), 'empty property', 'empty properties')} added`)
  if (fill && count('derived')) lines.push(`  ${plural(count('derived'), 'value')} filled in from what soii could work out (author, created, …)`)
  if (report.skipped.length) lines.push(`  ${plural(report.skipped.length, 'note')} skipped because soii cannot read them (\`soii check\` lists them)`)
  for (const n of report.changed.slice(0, 3)) lines.push(`  e.g. ${n.path}: ${n.changes.map(c => c.key).join(', ')}`)
  return lines
}

/** Add types and properties on a branch, show the numbers, merge after a yes. Never overwrites a value. */
async function tidyNotes(ctx: Ctx, p: Prompter, vault: string, plan: Plan): Promise<void> {
  const state = await repoState(ctx, vault)
  if (state !== 'clean') {
    ctx.out(`\nI left your notes alone: ${state === 'none' ? 'the vault is not a git repository' : 'the vault has changes that are not committed'}. To add properties later: bun ${join(vault, '.soii', 'soii', 'scripts', 'vault-normalise.ts')} ${vault} --write`)
    return
  }
  const base = (await git(ctx, vault, ['symbolic-ref', '--short', '-q', 'HEAD'])).out.trim()
  if (!base) {
    ctx.out('\nI left your notes alone: the vault is not on a branch (detached HEAD).')
    return
  }
  let branch = 'soii/setup'
  for (let n = 2; (await git(ctx, vault, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`])).code === 0; n++) branch = `soii/setup-${n}`
  const made = await git(ctx, vault, ['switch', '-q', '-c', branch])
  if (made.code !== 0) {
    ctx.err(`soii: could not make the branch ${branch}: ${made.out.split('\n')[0]}`)
    return
  }
  ctx.out(`\nWorking on the branch ${branch}, so your ${base} stays as it was…`)
  const report = await normaliseVault(vault, { write: true, typeMap: plan.typeMap, typeOnly: !plan.fill })
  if (report.changed.length === 0) {
    await git(ctx, vault, ['switch', '-q', base])
    await git(ctx, vault, ['branch', '-q', '-D', branch])
    ctx.out('There was nothing to change.')
    return
  }
  await git(ctx, vault, ['add', '-A'])
  const commit = await git(ctx, vault, ['commit', '-q', '-m', `soii: add ${plan.typeMap.length ? 'types' : ''}${plan.typeMap.length && plan.fill ? ' and ' : ''}${plan.fill ? 'properties' : ''}`])
  if (commit.code !== 0) {
    ctx.err(`soii: the changes were written on ${branch} but not committed (${commit.out.split('\n')[0]}). Look with \`git status\`.`)
    return
  }
  ctx.out(describe(report, plan.fill).join('\n'))
  let merge = false
  try {
    merge = await askYesNo(p, `\nMerge these changes into ${base} now?`, true)
  } catch (err) {
    if (!(err instanceof Aborted)) throw err
    ctx.out('')
  }
  await git(ctx, vault, ['switch', '-q', base])
  if (!merge) {
    ctx.out(`Not merged. Look at them with \`git diff ${base}..${branch}\`, and merge with \`git merge ${branch}\` when you are happy.`)
    return
  }
  const merged = await git(ctx, vault, ['merge', '--no-ff', '-q', '-m', `soii: merge ${branch}`, branch])
  if (merged.code !== 0) {
    await git(ctx, vault, ['merge', '--abort'])
    ctx.err(`soii: the merge did not go through (${merged.out.split('\n')[0]}). Your ${base} is unchanged; the work is on ${branch}.`)
    return
  }
  await git(ctx, vault, ['branch', '-q', '-d', branch])
  ctx.out(`Merged into ${base}.`)
}

async function execute(ctx: Ctx, p: Prompter, plan: Plan, flags: Flags, deps: WizardDeps): Promise<number> {
  const withBoot: Flags = { ...flags, boot: plan.boot }
  let code: number
  if (plan.mode === 'new') code = await deps.init(ctx, plan.vault, { ...withBoot, empty: !plan.samples })
  else if (plan.mode === 'copy') {
    code = await deps.init(ctx, plan.vault, { ...withBoot, empty: true }, dest => {
      const r = importVault(plan.source!, dest)
      ctx.out(`Copied ${plural(r.copied.length, 'file')} from ${plan.source}.${r.conflicts.length ? ` ${r.conflicts.length} had the same name as a starter file and the starter's was kept.` : ''}`)
    })
  } else {
    if (plan.gitInit && !(await startRepo(ctx, plan.vault))) return 1
    code = await deps.install(ctx, plan.vault, withBoot)
  }
  if (code !== 0) return code

  if (plan.fill || plan.typeMap.length) await tidyNotes(ctx, p, plan.vault, plan)

  const port = flags.port ?? 5011
  if (!flags.noService) {
    ctx.out('\nAll done. Next time, `soii status`, `soii open`, `soii update` and the rest work from any terminal.')
    if (plan.open) await deps.open(ctx)
  } else ctx.out(`\nAll done. To run it later: bun ${join(plan.vault, '.soii', 'soii', 'bin', 'soii.ts')} install ${plan.vault}`)
  ctx.out(`In Claude Code? Open it in ${plan.vault} and type /soii-intro for a tour.${flags.noService ? '' : ` Otherwise just use soii at http://localhost:${port}.`}`)
  return 0
}

/** The wizard. Returns the exit code. */
export async function runWizard(ctx: Ctx, flags: Flags, deps: WizardDeps = realDeps, prompter: Prompter = ctx.prompter()): Promise<number> {
  try {
    ctx.out('Welcome to soii. It turns a folder of notes into a calm app on your computer.\nI will ask a few questions; press Enter to take the answer in [brackets].\nNothing is written until you say "y" at the end, and Ctrl-C stops at any time.\n')
    if (!(await prerequisites(ctx))) return 1
    const plan = await ask(ctx, prompter, flags)
    ctx.out(recap(ctx, plan, flags))
    if (!(await askYesNo(prompter, 'Go ahead?', false))) {
      ctx.out('OK, nothing was written.')
      return 0
    }
    ctx.out('')
    return await execute(ctx, prompter, plan, flags, deps)
  } catch (err) {
    if (err instanceof Aborted) {
      ctx.out('\nCancelled. Nothing was written.')
      return 1
    }
    throw err
  } finally {
    prompter.close()
  }
}
