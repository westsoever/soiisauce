// Compiles template (the starter vault `soii init` copies, also the screenshot vault) through
// Core's real compiler: it must build without a single warning, and every tab of
// every workspace must have something to show.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildFeed } from '../lib/feed'
import { canonicalType, runTab } from '../lib/query'
import { TYPE_FIELDS } from '../lib/type-fields'
import type { TabConfig, VaultIndex } from '../lib/types'
import { inspectVault } from '../../scripts/check-vault'
import { compileVault } from './compile'
import { parseFrontmatter } from './frontmatter'

const ROOT = join(import.meta.dir, '..', '..')
const VAULT = join(ROOT, 'template')

let outDir = ''
let index: VaultIndex
let warnings: string[] = []

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'soii-template-'))
  ;({ index, warnings } = await compileVault({ vaultDir: VAULT, outDir }))
})

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

function tabOf(workspace: string, tab: string): TabConfig {
  const found = index.config.workspaces.find(w => w.id === workspace)?.tabs.find(t => t.id === tab)
  if (!found) throw new Error(`no tab ${workspace}.${tab}`)
  return found
}

const notesOf = (workspace: string, tab: string) => runTab(tabOf(workspace, tab), index)
const byType = (type: string) => index.notes.filter(n => n.type === type)

describe('template', () => {
  test('compiles with no warnings (no bad frontmatter, no broken wikilinks)', () => {
    expect(warnings).toEqual([])
    expect(index.warnings).toEqual([])
  })

  test('keeps the built-in workspaces and adds Projects', () => {
    expect(index.config.workspaces.map(w => w.id)).toEqual(['inbox', 'today', 'library', 'people', 'finance', 'goals', 'projects'])
    expect(index.config.workspaces.find(w => w.id === 'today')?.tabs.map(t => t.id)).toEqual(['brief', 'weekly', 'journal'])
  })

  test('every tab of every workspace has notes', () => {
    const empty = index.config.workspaces.flatMap(w => w.tabs.filter(t => runTab(t, index).length === 0).map(t => `${w.id}.${t.id}`))
    expect(empty).toEqual([])
  })

  test('templates and the vault README stay out', () => {
    const paths = index.notes.map(n => n.path)
    expect(paths.some(p => p.startsWith('Templates/'))).toBe(false)
    expect(paths).not.toContain('README.md')
  })

  test('every note with a type uses a canonical type soii knows', () => {
    const known = new Set([...Object.keys(index.config.types), 'project'])
    expect(index.notes.filter(n => n.type && !known.has(n.type)).map(n => n.path)).toEqual([])
  })

  test('Today feeds are dated: briefs, weekly reviews and journal entries', () => {
    expect(buildFeed(notesOf('today', 'brief')).days.length).toBeGreaterThanOrEqual(5)
    expect(buildFeed(notesOf('today', 'weekly')).days.length).toBeGreaterThanOrEqual(3)
    expect(buildFeed(notesOf('today', 'journal')).days.length).toBeGreaterThanOrEqual(10)
    expect(notesOf('today', 'brief').some(n => n.path.startsWith('01-Daily/'))).toBe(false)
  })

  test('Library Journal holds only the video log entries, not the daily notes', () => {
    const entries = notesOf('library', 'journal')
    expect(buildFeed(entries).days.length).toBeGreaterThanOrEqual(3)
    expect(entries.every(n => n.type === 'video-log')).toBe(true)
  })

  test('Library media have local covers that compile into files', () => {
    const media = ['book', 'audiobook', 'movie', 'documentary', 'video', 'recipe'].flatMap(byType)
    expect(media.length).toBeGreaterThanOrEqual(20)
    for (const note of media) {
      expect(note.image).toStartWith('/api/files/Attachments/covers/')
      const file = decodeURIComponent(note.image!.replace('/api/files/', ''))
      expect(existsSync(join(outDir, 'files', file))).toBe(true)
    }
  })

  test('Library uses the documented status values, ratings 1–5 and collections', () => {
    const allowed: Record<string, string[]> = {
      book: ['want', 'reading', 'finished', 'abandoned'],
      audiobook: ['want', 'reading', 'finished', 'abandoned'],
      movie: ['watchlist', 'watched'],
      documentary: ['watchlist', 'watched'],
      research: ['to-read', 'reading', 'read']
    }
    for (const [type, statuses] of Object.entries(allowed)) {
      for (const note of byType(type)) {
        expect(statuses).toContain(note.frontmatter.status as string)
        const rating = note.frontmatter.rating
        if (rating != null) expect(rating as number).toBeWithin(1, 6) // an empty `rating:` is null
      }
    }
    expect(new Set(byType('book').map(n => n.frontmatter.status))).toEqual(new Set(['want', 'reading', 'finished', 'abandoned']))
    expect(['book', 'audiobook', 'movie', 'documentary', 'video', 'research', 'article'].flatMap(byType).every(n => n.frontmatter.collection)).toBe(true)
  })

  test('People: last seen comes from last_contact or dated lines, and the tabs split friends and network', () => {
    const lea = index.notes.find(n => n.id === '05-Knowledge/People/Lea Fischer')
    expect(lea?.lastSeen).toBe('2026-09-20')
    expect(notesOf('people', 'friends').length).toBeGreaterThanOrEqual(5)
    expect(notesOf('people', 'network').map(n => n.title)).toEqual(expect.arrayContaining(['Anders Bak', 'Priya Shah', 'Freja Nørgaard']))
  })

  test('Finance and Goals cover every status and both currencies', () => {
    expect(new Set(byType('subscription').map(n => n.frontmatter.status))).toEqual(new Set(['active', 'paused', 'cancelled']))
    expect(new Set(byType('expense').map(n => n.frontmatter.currency))).toEqual(new Set(['DKK', 'EUR']))
    expect(new Set(byType('goal').map(n => n.frontmatter.status))).toEqual(new Set(['idea', 'active', 'done', 'dropped']))
    expect(new Set(byType('goal').map(n => n.frontmatter.horizon))).toEqual(new Set(['year', 'life', 'bucket']))
  })

  test('every template has the complete documented properties for its type', () => {
    const dir = join(VAULT, 'Templates')
    const checked: string[] = []
    for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const { data } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'))
      const type = canonicalType(String(data.type ?? ''), index.config.types)
      if (!TYPE_FIELDS[type]) continue
      checked.push(file)
      expect({ file, missing: TYPE_FIELDS[type].filter(k => !(k in data)) }).toEqual({ file, missing: [] })
    }
    expect(checked.length).toBeGreaterThanOrEqual(12)
  })

  test('the sample notes have the documented properties too, so a fresh vault passes its own check', async () => {
    const { findings } = await inspectVault(VAULT)
    expect(findings.filter(f => f.rule === 'missing-field').map(f => f.path)).toEqual([])
  })

  test('the README tells a new user the same install steps as the repo README, and names the key skills', () => {
    const own = readFileSync(join(VAULT, 'README.md'), 'utf8')
    const root = readFileSync(join(ROOT, 'README.md'), 'utf8')
    // The one-command install in both READMEs; the by-hand steps stay in docs/setup.md.
    for (const line of ['curl -fsSL https://raw.githubusercontent.com/westsoever/soiisauce/main/install.sh | bash', 'bash -s -- init ~/my-vault']) {
      expect(root).toContain(line)
      expect(own).toContain(line)
    }
    for (const text of [root, own]) {
      expect(text).not.toContain('gh auth login')
      expect(text).not.toMatch(/repo is private|private `westsoever\/soii`/)
    }
    const setup = readFileSync(join(ROOT, 'docs', 'setup.md'), 'utf8')
    for (const line of ['git clone --depth 1 https://github.com/westsoever/soiisauce.git ~/soii-installer', '(cd ~/soii-installer && bun install --frozen-lockfile)', 'bun ~/soii-installer/bin/soii.ts init ~/my-vault', 'bun ~/soii-installer/bin/soii.ts install']) expect(setup).toContain(line)
    for (const skill of ['soii-intro', 'soii-setup', 'soii-wrap', 'soii-chat', 'soii-learn', 'soii-explore', 'soii-health']) expect(own).toContain(`/${skill}`)
    for (const word of ['localhost:5011', 'Log', 'Sync', 'Obsidian']) expect(own).toContain(word)
  })

  test('.soii/ (the pinned install) is never indexed as notes', () => {
    expect(index.notes.some(n => n.id.startsWith('.soii'))).toBe(false)
  })

  test('the starter kit pieces are there', () => {
    const pkg = JSON.parse(readFileSync(join(VAULT, '.soii', 'package.json'), 'utf8'))
    expect(pkg.private).toBe(true)
    expect(pkg.dependencies.soii).toMatch(/^github:westsoever\/soiisauce#v\d+\.\d+\.\d+$/)
    const ignore = readFileSync(join(VAULT, '.soii', '.gitignore'), 'utf8').split('\n')
    for (const entry of ['node_modules/', 'dist/', 'logs/', '.env.local']) expect(ignore).toContain(entry)
    expect(existsSync(join(VAULT, '.github'))).toBe(false) // a local-first vault has no CI workflows
    for (const t of ['Book', 'Audiobook', 'Movie', 'Documentary', 'Video', 'Research paper', 'Article', 'Person', 'Goal', 'Account', 'Subscription', 'Expense', 'Daily brief', 'Weekly review']) {
      expect(existsSync(join(VAULT, 'Templates', `${t}.md`))).toBe(true)
    }
  })
})
