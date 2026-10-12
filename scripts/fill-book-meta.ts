// Fills the empty `cover`, `author` and `isbn` of book notes from Google Books, a few at a time.
// soii's own cover lookup runs every time a card is shown, and nothing remembers the answer on a
// local machine, so a big library burns the free daily quota in a couple of page loads. This
// looks each book up once and writes the answer into the note instead.
//
//   bun scripts/fill-book-meta.ts [--limit 50] [--commit] [--dry-run] [--retry] [--folder <path in vault>]
//
// Needs VAULT_PATH and GOOGLE_BOOKS_API_KEY (bun reads .env.local). It only ever fills a
// property that is a bare `key:`; anything you've written stays. Books it can't match with
// confidence are listed, not guessed. Progress is remembered in .artifacts/book-meta-state.json,
// so the next run takes the next books. `--commit` commits just the notes it changed; pushing is up to you.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { yamlString } from '../app/lib/new-note'
import { cleanThumbnail, UpstreamError } from '../app/server/covers/google-books'
import type { FetchLike } from '../app/server/covers/types'

const ENDPOINT = 'https://www.googleapis.com/books/v1/volumes'
export const DEFAULT_FOLDER = '04-Resources/Library/Books'
const STATE_FILE = join(import.meta.dir, '..', '.artifacts', 'book-meta-state.json')
/** Google's default is about one request per second per user. */
const PAUSE_MS = 1100

export interface Candidate {
  title: string
  authors: string[]
  isbn: string | null
  cover: string | null
}

// ---- matching ------------------------------------------------------------------------------

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** "Sprint: How to Solve Big Problems…" → "Sprint"; "X by Y" loses the "by Y" tail. */
export const mainTitle = (t: string) => normalize(t.split(':')[0].replace(/\s+by\s+[^:]+$/i, ''))

function mentionsAuthor(description: string, authors: string[]): boolean {
  const text = normalize(description)
  return authors.some(a => {
    const last = normalize(a).split(' ').pop() ?? ''
    return last.length >= 3 && new RegExp(`(^| )${last}( |$)`).test(text)
  })
}

export type Match = { kind: 'match' | 'review'; candidate: Candidate } | { kind: 'none' }

/**
 * Title-only search is ambiguous for short titles (Drive, Peak, Who), so a match must have the same
 * main title and a cover, and a short title also needs the description to name the author.
 * Anything less certain goes to the review list.
 */
export function pickMatch(title: string, description: string, candidates: Candidate[]): Match {
  const wanted = mainTitle(title)
  const same = candidates.filter(c => c.cover && mainTitle(c.title) === wanted)
  const best = same.find(c => c.authors.length > 0) ?? same[0]
  if (!best) return { kind: 'none' }
  const confident = wanted.split(' ').length >= 3 || mentionsAuthor(description, best.authors)
  return { kind: confident ? 'match' : 'review', candidate: best }
}

// ---- Google Books --------------------------------------------------------------------------

type Volumes = {
  items?: Array<{
    volumeInfo?: {
      title?: string
      authors?: string[]
      imageLinks?: { thumbnail?: string }
      industryIdentifiers?: Array<{ type?: string; identifier?: string }>
    }
  }>
}

export async function searchVolumes(q: string, deps: { fetch: FetchLike; apiKey?: string }): Promise<Candidate[]> {
  const params = new URLSearchParams({ q, maxResults: '10', printType: 'books' })
  if (deps.apiKey) params.set('key', deps.apiKey)
  const res = await deps.fetch(`${ENDPOINT}?${params}`)
  if (!res.ok) throw new UpstreamError(res.status)
  const body = (await res.json()) as Volumes
  return (body.items ?? []).map(item => {
    const v = item.volumeInfo ?? {}
    const ids = v.industryIdentifiers ?? []
    const isbn = ids.find(i => i.type === 'ISBN_13')?.identifier ?? ids.find(i => i.type === 'ISBN_10')?.identifier ?? null
    return { title: v.title ?? '', authors: v.authors ?? [], isbn, cover: v.imageLinks?.thumbnail ? cleanThumbnail(v.imageLinks.thumbnail) : null }
  })
}

// ---- notes ---------------------------------------------------------------------------------

const frontmatterOf = (text: string) => text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)

export interface BookNote {
  path: string
  title: string
  description: string
}

/** A `type: book` note whose `cover:` is a bare key (no value, no list under it). */
export function readCandidate(path: string, text: string): BookNote | null {
  const fm = frontmatterOf(text)?.[1]
  if (!fm || !/^type:\s*book\s*$/m.test(fm) || !hasBareKey(fm, 'cover')) return null
  const value = (key: string) => {
    const raw = fm.match(new RegExp(`^${key}:[ \\t]*(.+)$`, 'm'))?.[1].trim() ?? ''
    if (raw.startsWith('"')) {
      try {
        return JSON.parse(raw) as string
      } catch {
        return raw
      }
    }
    return raw
  }
  return { path, title: value('title'), description: value('description') }
}

function hasBareKey(fm: string, key: string): boolean {
  const lines = fm.split('\n')
  const i = lines.findIndex(l => new RegExp(`^${key}:[ \\t]*$`).test(l))
  return i !== -1 && !/^[ \t-]/.test(lines[i + 1] ?? '')
}

/** Fills the bare keys it has a value for. Returns the new text and which keys it set. */
export function fillProperties(text: string, values: { cover?: string | null; author?: string | null; isbn?: string | null }): { text: string; filled: string[] } {
  const fm = frontmatterOf(text)
  if (!fm) return { text, filled: [] }
  const lines = fm[1].split('\n')
  const filled: string[] = []
  for (const key of ['cover', 'author', 'isbn'] as const) {
    const value = values[key]
    if (!value || !hasBareKey(lines.join('\n'), key)) continue
    const i = lines.findIndex(l => new RegExp(`^${key}:[ \\t]*$`).test(l))
    lines[i] = `${key}: ${yamlString(value)}`
    filled.push(key)
  }
  // A function, not a string: a `$1` or `$&` in a description must not be read as a replacement pattern.
  return { text: text.replace(fm[1], () => lines.join('\n')), filled }
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

// ---- the run -------------------------------------------------------------------------------

type State = Record<string, { status: 'filled' | 'notfound' | 'review'; at: string; candidate?: Candidate }>

export interface Options {
  vault: string
  folder?: string
  limit?: number
  commit?: boolean
  dryRun?: boolean
  retry?: boolean
  apiKey?: string
  statePath?: string
}

export interface Deps {
  fetch: FetchLike
  sleep: (ms: number) => Promise<void>
  git: (cwd: string, args: string[]) => Promise<string>
  log: (line: string) => void
  now: () => Date
}

export interface Report {
  looked: number
  filled: string[]
  review: Array<{ title: string; candidate: Candidate }>
  notFound: string[]
  skippedDirty: string[]
  remaining: number
  stopped: string | null
  committed: boolean
}

export async function run(opts: Options, deps: Deps): Promise<Report> {
  const folder = join(opts.vault, opts.folder ?? DEFAULT_FOLDER)
  const statePath = opts.statePath ?? STATE_FILE
  const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
  const limit = opts.limit ?? 50
  const report: Report = { looked: 0, filled: [], review: [], notFound: [], skippedDirty: [], remaining: 0, stopped: null, committed: false }

  const todo = walk(folder)
    .map(file => ({ file, rel: relative(opts.vault, file) }))
    .filter(({ rel }) => opts.retry || !state[rel])
    .flatMap(({ file, rel }) => {
      const note = readCandidate(rel, readFileSync(file, 'utf8'))
      return note ? [{ file, note }] : []
    })

  const changed: string[] = []
  let failures = 0
  for (const { file, note } of todo) {
    if (report.looked >= limit) break
    if (opts.commit && (await deps.git(opts.vault, ['status', '--porcelain', '--', note.path])).trim()) {
      report.skippedDirty.push(note.path)
      continue
    }
    if (report.looked > 0) await deps.sleep(PAUSE_MS)
    let match: Match
    try {
      const main = note.title.split(':')[0].replace(/\s+/g, ' ').trim()
      match = pickMatch(note.title, note.description, await searchVolumes(`intitle:"${main}"`, { fetch: deps.fetch, apiKey: opts.apiKey }))
      if (match.kind === 'none') {
        await deps.sleep(PAUSE_MS)
        match = pickMatch(note.title, note.description, await searchVolumes(note.title, { fetch: deps.fetch, apiKey: opts.apiKey }))
      }
      failures = 0
    } catch (error) {
      if (error instanceof UpstreamError && (error.status === 429 || error.status === 403)) {
        report.stopped = `Google answered ${error.status}: the daily or per-second quota is used up. Nothing was lost; run again later.`
        break
      }
      if (++failures >= 3) {
        report.stopped = `Three lookups in a row failed (${error instanceof Error ? error.message : 'unknown'}). Try again later.`
        break
      }
      deps.log(`  ! ${note.title}: ${error instanceof Error ? error.message : 'lookup failed'}, will retry next run`)
      continue
    }
    report.looked++
    const at = deps.now().toISOString()
    if (match.kind === 'match') {
      const done = fillProperties(readFileSync(file, 'utf8'), { cover: match.candidate.cover, author: match.candidate.authors.join(', '), isbn: match.candidate.isbn })
      report.filled.push(note.title)
      if (!opts.dryRun) {
        writeFileSync(file, done.text)
        changed.push(note.path)
        state[note.path] = { status: 'filled', at }
      }
    } else if (match.kind === 'review') {
      report.review.push({ title: note.title, candidate: match.candidate })
      if (!opts.dryRun) state[note.path] = { status: 'review', at, candidate: match.candidate }
    } else {
      report.notFound.push(note.title)
      if (!opts.dryRun) state[note.path] = { status: 'notfound', at }
    }
  }
  report.remaining = Math.max(0, todo.length - report.looked - report.skippedDirty.length)

  if (!opts.dryRun) {
    mkdirSync(dirname(statePath), { recursive: true })
    writeFileSync(statePath, JSON.stringify(state, null, 1))
    if (opts.commit && changed.length) {
      await deps.git(opts.vault, ['add', '--', ...changed])
      await deps.git(opts.vault, ['commit', '-m', `soii: fill cover, author and isbn for ${changed.length} books`, '--', ...changed])
      report.committed = true
    }
  }
  return report
}

// ---- CLI -----------------------------------------------------------------------------------

const realGit = (cwd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile('git', args, { cwd, timeout: 60_000 }, (err, stdout, stderr) => (err ? reject(new Error(`${stderr || err.message}`.trim())) : resolve(stdout)))
  )

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (name: string) => process.argv.includes(`--${name}`)

if (import.meta.main) {
  const vault = process.env.VAULT_PATH?.trim()
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim()
  if (!vault || !existsSync(vault)) {
    console.error('Set VAULT_PATH to your vault folder (in .env.local).')
    process.exit(1)
  }
  if (!apiKey) {
    console.error('Set GOOGLE_BOOKS_API_KEY in .env.local first: without a key the shared quota is gone almost immediately.')
    process.exit(1)
  }
  const limit = Number(arg('limit') ?? 50)
  if (!Number.isInteger(limit) || limit < 1) {
    console.error('--limit must be a positive whole number.')
    process.exit(1)
  }
  if (flag('commit') && !existsSync(join(vault, '.git'))) {
    console.error('--commit needs the vault to be a git repository.')
    process.exit(1)
  }
  const report = await run(
    { vault, apiKey, limit, folder: arg('folder'), commit: flag('commit'), dryRun: flag('dry-run'), retry: flag('retry') },
    { fetch: (input, init) => fetch(input, init), sleep: ms => new Promise(r => setTimeout(r, ms)), git: realGit, log: console.log, now: () => new Date() }
  )
  console.log(`\nLooked up ${report.looked}: filled ${report.filled.length}, to review ${report.review.length}, not found ${report.notFound.length}.`)
  for (const r of report.review) console.log(`  review: "${r.title}" → "${r.candidate.title}" by ${r.candidate.authors.join(', ') || 'unknown'}`)
  for (const t of report.notFound) console.log(`  not found: "${t}"`)
  if (report.skippedDirty.length) console.log(`Skipped ${report.skippedDirty.length} notes with uncommitted edits.`)
  if (report.committed) console.log('Committed in the vault. Push when you are happy: git -C "$VAULT_PATH" push')
  if (flag('dry-run')) console.log('(dry run: nothing written)')
  console.log(`${report.remaining} books still need a cover.`)
  if (report.stopped) {
    console.log(`\nStopped early: ${report.stopped}`)
    process.exit(2)
  }
}
