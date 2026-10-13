// scripts/fill-book-meta.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UpstreamError } from '../app/server/covers/google-books'
import { fillProperties, mainTitle, pickMatch, readCandidate, run, type Candidate, type Deps } from './fill-book-meta'

const cand = (over: Partial<Candidate> = {}): Candidate => ({ title: 'Sprint', authors: ['Jake Knapp'], isbn: '9781501121746', cover: 'https://books.google.com/x?id=1', ...over })

const BOOK = (title: string, extra = '') =>
  `---\ntype: book\ntitle: ${JSON.stringify(title)}\nauthor:\nisbn:\ncover:\nstatus: want\ndescription: Five days. Jake Knapp wrote it for $100M teams.\ncategory:\n  - Startup Methodologies\ntags:\n  - ReadingList\n${extra}---\n\n# ${title}\n`

describe('mainTitle', () => {
  test('drops the subtitle and a trailing "by Author"', () => {
    expect(mainTitle('Sprint: How to Solve Big Problems')).toBe('sprint')
    expect(mainTitle("The Inmates Are Running the Asylum: Why High Tech by Alan Cooper")).toBe('the inmates are running the asylum')
    expect(mainTitle('Drive')).toBe('drive')
  })
})

describe('pickMatch', () => {
  test('a long title with the same main title matches', () => {
    const r = pickMatch('The Hard Thing About Hard Things: Building a Business', '', [cand({ title: 'The Hard Thing About Hard Things' })])
    expect(r.kind).toBe('match')
  })

  test('a short title needs the description to name the author, else it goes to review', () => {
    expect(pickMatch('Drive', 'Daniel Pink reveals what motivates us.', [cand({ title: 'Drive', authors: ['Daniel H. Pink'] })]).kind).toBe('match')
    expect(pickMatch('Drive', 'Autonomy, mastery and purpose.', [cand({ title: 'Drive', authors: ['Daniel H. Pink'] })]).kind).toBe('review')
  })

  test('a different title, or one without a cover, is not a match', () => {
    expect(pickMatch('Drive', 'Daniel Pink', [cand({ title: 'Drive Your Business' })]).kind).toBe('none')
    expect(pickMatch('Zero to One', '', [cand({ title: 'Zero to One', cover: null })]).kind).toBe('none')
  })

  test('prefers a candidate that has authors', () => {
    const r = pickMatch('Zero to One: Notes', '', [cand({ title: 'Zero to One', authors: [], isbn: 'a' }), cand({ title: 'Zero to One', authors: ['Peter Thiel'], isbn: 'b' })])
    expect(r.kind === 'match' && r.candidate.isbn).toBe('b')
  })
})

describe('notes', () => {
  test('readCandidate finds books with a bare cover only', () => {
    expect(readCandidate('a.md', BOOK('Sprint'))?.title).toBe('Sprint')
    expect(readCandidate('a.md', BOOK('Sprint').replace('cover:\n', 'cover: https://x/y.png\n'))).toBeNull()
    expect(readCandidate('a.md', BOOK('Sprint').replace('type: book', 'type: movie'))).toBeNull()
    expect(readCandidate('a.md', 'no frontmatter')).toBeNull()
  })

  test('fillProperties sets only bare keys and leaves everything else alone', () => {
    const text = BOOK('Sprint').replace('author:\n', 'author: Someone I typed\n')
    const out = fillProperties(text, { cover: 'https://c/1', author: 'Jake Knapp', isbn: '978' })
    expect(out.filled).toEqual(['cover', 'isbn'])
    expect(out.text).toContain('author: Someone I typed\n')
    expect(out.text).toContain('isbn: "978"\n')
    expect(out.text).toContain('cover: https://c/1\n')
    expect(out.text).toContain('description: Five days. Jake Knapp wrote it for $100M teams.')
    expect(out.text.endsWith('# Sprint\n')).toBe(true)
  })

  test('fillProperties does not treat $ in the note as a replacement pattern', () => {
    const out = fillProperties(BOOK('Sprint').replace('description: Five days.', () => 'description: Costs $& and $1 each.'), { cover: 'https://c/1' })
    expect(out.text).toContain('description: Costs $& and $1 each.')
  })

  test('a list under author is not a bare key', () => {
    const text = BOOK('X').replace('author:\n', 'author:\n  - "[[Adrian]]"\n')
    expect(fillProperties(text, { author: 'Nope' }).filled).not.toContain('author')
  })
})

describe('run', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))

  function setup(titles: string[]) {
    const root = mkdtempSync(join(tmpdir(), 'soii-bookmeta-'))
    dirs.push(root)
    const folder = join(root, 'vault', '04-Resources/Library/Books/ReadingList')
    mkdirSync(folder, { recursive: true })
    for (const t of titles) writeFileSync(join(folder, `${t}.md`), BOOK(t))
    return { vault: join(root, 'vault'), folder, statePath: join(root, 'state.json') }
  }

  function deps(over: Partial<Deps> & { responses?: Record<string, unknown> } = {}) {
    const urls: string[] = []
    const gitCalls: string[][] = []
    const d: Deps = {
      fetch: async input => {
        urls.push(input)
        const q = new URL(input).searchParams.get('q') ?? ''
        const title = q.replace(/^intitle:"?|"$/g, '')
        const items = [{ volumeInfo: { title, authors: ['Jake Knapp'], imageLinks: { thumbnail: 'http://books.google.com/b?id=1&edge=curl' }, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781' }] } }]
        return new Response(JSON.stringify({ items }), { status: 200 })
      },
      sleep: async () => {},
      git: async (_cwd, args) => {
        gitCalls.push(args)
        return ''
      },
      log: () => {},
      now: () => new Date('2026-10-12T10:00:00Z'),
      ...over
    }
    return { d, urls, gitCalls }
  }

  test('fills cover, author and isbn, cleans the thumbnail, and remembers the book', async () => {
    const s = setup(['Alpha Beta Gamma'])
    const { d } = deps()
    const report = await run({ vault: s.vault, apiKey: 'k', statePath: s.statePath }, d)
    expect(report).toMatchObject({ looked: 1, filled: ['Alpha Beta Gamma'], remaining: 0, stopped: null })
    const text = readFileSync(join(s.folder, 'Alpha Beta Gamma.md'), 'utf8')
    expect(text).toContain('cover: https://books.google.com/b?id=1\n')
    expect(text).toContain('author: Jake Knapp')
    expect(text).toContain('isbn: "9781"')
    expect(JSON.parse(readFileSync(s.statePath, 'utf8'))['04-Resources/Library/Books/ReadingList/Alpha Beta Gamma.md'].status).toBe('filled')
  })

  test('respects the limit, and the next run takes the next books', async () => {
    const s = setup(['One Two Three', 'Four Five Six', 'Seven Eight Nine'])
    const first = await run({ vault: s.vault, apiKey: 'k', limit: 2, statePath: s.statePath }, deps().d)
    expect(first).toMatchObject({ looked: 2, remaining: 1 })
    const second = await run({ vault: s.vault, apiKey: 'k', limit: 2, statePath: s.statePath }, deps().d)
    expect(second.filled).toEqual(['Seven Eight Nine'])
  })

  test('books it cannot match are remembered and not retried, unless asked', async () => {
    const s = setup(['Alpha Beta Gamma'])
    const empty = deps({ fetch: async () => new Response(JSON.stringify({ items: [] }), { status: 200 }) })
    const first = await run({ vault: s.vault, apiKey: 'k', statePath: s.statePath }, empty.d)
    expect(first.notFound).toEqual(['Alpha Beta Gamma'])
    expect((await run({ vault: s.vault, apiKey: 'k', statePath: s.statePath }, deps().d)).looked).toBe(0)
    expect((await run({ vault: s.vault, apiKey: 'k', retry: true, statePath: s.statePath }, deps().d)).looked).toBe(1)
  })

  test('a 429 stops the run and the book is not recorded as tried', async () => {
    const s = setup(['Alpha Beta Gamma', 'Four Five Six'])
    const limited = deps({ fetch: async () => new Response('{}', { status: 429 }) })
    const report = await run({ vault: s.vault, apiKey: 'k', statePath: s.statePath }, limited.d)
    expect(report.stopped).toContain('429')
    expect(report.looked).toBe(0)
    expect(report.remaining).toBe(2)
    expect(readFileSync(join(s.folder, 'Alpha Beta Gamma.md'), 'utf8')).toBe(BOOK('Alpha Beta Gamma'))
  })

  test('a dry run looks up but writes nothing', async () => {
    const s = setup(['Alpha Beta Gamma'])
    const report = await run({ vault: s.vault, apiKey: 'k', dryRun: true, statePath: s.statePath }, deps().d)
    expect(report.filled).toEqual(['Alpha Beta Gamma'])
    expect(readFileSync(join(s.folder, 'Alpha Beta Gamma.md'), 'utf8')).toBe(BOOK('Alpha Beta Gamma'))
    expect(() => readFileSync(s.statePath)).toThrow()
  })

  test('--commit commits only the changed notes, and skips notes with uncommitted edits', async () => {
    const s = setup(['Alpha Beta Gamma', 'Four Five Six'])
    const g = deps({
      git: async (_c, args) => {
        g.calls.push(args)
        return args[0] === 'status' && args.includes('04-Resources/Library/Books/ReadingList/Four Five Six.md') ? ' M file' : ''
      }
    }) as ReturnType<typeof deps> & { calls: string[][] }
    g.calls = []
    const report = await run({ vault: s.vault, apiKey: 'k', commit: true, statePath: s.statePath }, g.d)
    expect(report.skippedDirty).toEqual(['04-Resources/Library/Books/ReadingList/Four Five Six.md'])
    expect(report.committed).toBe(true)
    const commit = g.calls.find(c => c[0] === 'commit')!
    expect(commit.slice(commit.indexOf('--') + 1)).toEqual(['04-Resources/Library/Books/ReadingList/Alpha Beta Gamma.md'])
  })

  test('an unrelated upstream error is skipped, and three in a row stop the run', async () => {
    const s = setup(['Aa Bb Cc', 'Dd Ee Ff', 'Gg Hh Ii', 'Jj Kk Ll'])
    const flaky = deps({ fetch: async () => new Response('{}', { status: 500 }) })
    const report = await run({ vault: s.vault, apiKey: 'k', statePath: s.statePath }, flaky.d)
    expect(report.stopped).toContain('Three lookups in a row failed')
    expect(report.looked).toBe(0)
    void UpstreamError
  })
})
