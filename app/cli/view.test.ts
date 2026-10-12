// app/cli/view.test.ts
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Flags } from './args'
import { realCtx, type Ctx } from './context'
import { view } from './view'

const TEMPLATE = join(import.meta.dir, '../../template')
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
beforeAll(() => {
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' })
})
function vault(): string {
  const d = mkdtempSync(join(tmpdir(), 'soii-viewcli-'))
  dirs.push(d)
  cpSync(TEMPLATE, d, { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: d })
  execFileSync('git', ['add', '-A'], { cwd: d })
  execFileSync('git', ['commit', '-q', '-m', 'first'], { cwd: d })
  return d
}
function capture(): { ctx: Ctx; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return { ctx: { ...realCtx(), out: m => out.push(m), err: m => err.push(m) }, out, err }
}
const flags = (f: Partial<Flags>): Flags => ({ follow: false, empty: false, noService: false, help: false, json: false, ...f })

describe('soii view', () => {
  test('fields --json lists types with counts', async () => {
    const v = vault()
    const c = capture()
    expect(await view(c.ctx, ['fields'], flags({ vault: v, json: true }))).toBe(0)
    const data = JSON.parse(c.out.join('\n'))
    expect(data.types.find((t: { value: string }) => t.value === 'book').count).toBeGreaterThan(0)
  })
  test('preview writes nothing and reports matches', async () => {
    const v = vault()
    const before = readFileSync(join(v, 'soii.config.yml'), 'utf8')
    const c = capture()
    expect(await view(c.ctx, ['preview', 'library'], flags({ vault: v, json: true, tab: JSON.stringify({ title: 'Books', view: 'list', query: { type: 'book' } }) }))).toBe(0)
    const data = JSON.parse(c.out.join('\n'))
    expect(data.count).toBeGreaterThan(0)
    expect(data.titles.length).toBeLessThanOrEqual(10)
    expect(readFileSync(join(v, 'soii.config.yml'), 'utf8')).toBe(before)
  })
  test('add commits one file and prints the tab URL; list then shows it', async () => {
    const v = vault()
    const c = capture()
    expect(await view(c.ctx, ['add', 'projects'], flags({ vault: v, tab: JSON.stringify({ title: 'Ideas', view: 'list', query: { type: 'project', where: { status: 'idea' } } }) }))).toBe(0)
    expect(c.out.join('\n')).toContain('http://localhost:5011/#/projects/ideas')
    expect(execFileSync('git', ['log', '-1', '--name-only', '--format=%s'], { cwd: v, encoding: 'utf8' })).toBe('soii: add view "Ideas" to projects\n\nsoii.config.yml\n')
    const l = capture()
    expect(await view(l.ctx, ['list'], flags({ vault: v, json: true }))).toBe(0)
    const listed = JSON.parse(l.out.join('\n'))
    expect(listed.workspaces.find((w: { id: string }) => w.id === 'projects').tabs.map((t: { id: string }) => t.id)).toContain('ideas')
  })
  test('filter reports the count before and after', async () => {
    const v = vault()
    const c = capture()
    expect(await view(c.ctx, ['filter', 'projects', 'board'], flags({ vault: v, json: true, query: JSON.stringify({ type: 'project', where: { status: 'active' } }) }))).toBe(0)
    const data = JSON.parse(c.out.join('\n'))
    expect(data.before).toBeGreaterThanOrEqual(data.after)
  })
  test('refusals exit 1 with the app message; bad arguments exit 2', async () => {
    const v = vault()
    const c = capture()
    expect(await view(c.ctx, ['add', 'nowhere'], flags({ vault: v, tab: JSON.stringify({ title: 'X', view: 'list', query: {} }) }))).toBe(1)
    expect(c.err.join('\n')).toContain('No workspace "nowhere"')
    expect(await view(capture().ctx, ['add', 'projects'], flags({ vault: v, tab: '{not json' }))).toBe(2)
    expect(await view(capture().ctx, ['frobnicate'], flags({ vault: v }))).toBe(2)
  })
  test('add and sort check their input like the app does, and write nothing when it is wrong', async () => {
    const v = vault()
    const before = readFileSync(join(v, 'soii.config.yml'), 'utf8')
    const refused = async (sub: string[], f: Partial<Flags>, say: RegExp) => {
      const c = capture()
      expect(await view(c.ctx, sub, flags({ vault: v, ...f }))).toBe(1)
      expect(c.err.join('\n')).toMatch(say)
      expect(c.err.join('\n')).not.toContain('undefined is not an object')
    }
    // a key the schema doesn't know (a likely slip in a skill-written draft), a missing title, a non-object
    await refused(['add', 'projects'], { tab: '{"title":"A","view":"board","query":{"type":"project"},"groupBy":"status"}' }, /isn't valid/)
    await refused(['add', 'projects'], { tab: '{"view":"list","query":{}}' }, /isn't valid/)
    await refused(['add', 'projects'], { tab: 'null' }, /isn't valid/)
    // an object where a list belongs must not wipe the tab's sort
    await refused(['sort', 'projects', 'board'], { sort: '{"field":"date","dir":"desc"}' }, /./)
    expect(readFileSync(join(v, 'soii.config.yml'), 'utf8')).toBe(before)
  })
  test('list: only same-layout tabs count as similar', async () => {
    const v = vault()
    const addTab = (tab: object) => view(capture().ctx, ['add', 'projects'], flags({ vault: v, tab: JSON.stringify(tab) }))
    // Board is a board of every project; a list of the same notes is another way of looking, not a duplicate.
    expect(await addTab({ title: 'Project list', view: 'list', query: { type: 'project' } })).toBe(0)
    const a = capture()
    await view(a.ctx, ['list'], flags({ vault: v, json: true }))
    expect(JSON.parse(a.out.join('\n')).similar.filter((s: { workspace: string }) => s.workspace === 'projects')).toEqual([])
    expect(await addTab({ title: 'Board two', view: 'board', query: { type: 'project' } })).toBe(0)
    const b = capture()
    await view(b.ctx, ['list'], flags({ vault: v, json: true }))
    expect(JSON.parse(b.out.join('\n')).similar).toContainEqual(expect.objectContaining({ workspace: 'projects', a: 'board', b: 'board-two' }))
  })
  test('list: built-in workspaces the config does not define are left out of empty and similar', async () => {
    const v = vault()
    rmSync(join(v, '03-Areas', 'Finance'), { recursive: true, force: true })
    const run = async () => {
      const c = capture()
      expect(await view(c.ctx, ['list'], flags({ vault: v, json: true }))).toBe(0)
      return JSON.parse(c.out.join('\n')) as { workspaces: { id: string; tabs: { count: number }[] }[]; empty: { workspace: string }[]; similar: { workspace: string }[] }
    }
    const untouched = await run()
    // Finance still lists its tabs (with 0 notes), but nobody is told to clean up a workspace they never wrote.
    expect(untouched.workspaces.find(w => w.id === 'finance')!.tabs.some(t => t.count === 0)).toBe(true)
    expect(untouched.empty.filter(e => e.workspace === 'finance')).toEqual([])
    expect(untouched.similar.filter(e => ['finance', 'people', 'goals', 'library'].includes(e.workspace))).toEqual([])
    // The first change copies Finance into soii.config.yml; from then on it is the owner's, and counted.
    expect(await view(capture().ctx, ['sort', 'finance', 'subscriptions'], flags({ vault: v, sort: '[{"field":"title","dir":"asc"}]' }))).toBe(0)
    const customised = await run()
    expect(customised.empty.some(e => e.workspace === 'finance')).toBe(true)
  })
  test('the vault must be a vault: nothing is created in any other folder', async () => {
    const tmp = () => {
      const d = mkdtempSync(join(tmpdir(), 'soii-viewcli-'))
      dirs.push(d)
      return d
    }
    const elsewhere = tmp()
    const tab = JSON.stringify({ title: 'X', view: 'list', query: {} })
    const c = capture()
    expect(await view(c.ctx, ['add', 'people'], flags({ vault: elsewhere, tab }))).toBe(2)
    expect(c.err.join('\n')).toContain('is not a soii vault')
    expect(existsSync(join(elsewhere, 'soii.config.yml'))).toBe(false)
    // An Obsidian folder with no soii config yet is a vault.
    mkdirSync(join(elsewhere, '.obsidian'))
    expect(await view(capture().ctx, ['fields'], flags({ vault: elsewhere }))).toBe(0)
    // The same rules without --vault: the current folder, else the one soii is installed in.
    const cfg = tmp()
    const env = { ...process.env, SOII_CONFIG_DIR: cfg }
    const inFolder = async (cwd: string) => {
      const out: string[] = []
      const err: string[] = []
      const ctx: Ctx = { ...realCtx(), env, cwd, out: m => out.push(m), err: m => err.push(m) }
      return { code: await view(ctx, ['fields'], flags({})), err: err.join('\n') }
    }
    expect(await inFolder(elsewhere)).toMatchObject({ code: 0 })
    const plain = tmp()
    expect(await inFolder(plain)).toMatchObject({ code: 2, err: expect.stringContaining('No vault here') })
    writeFileSync(join(cfg, 'config.json'), JSON.stringify({ vault: plain, port: 5011 }))
    expect(await inFolder(tmp())).toMatchObject({ code: 2, err: expect.stringContaining('is not a soii vault') })
    writeFileSync(join(cfg, 'config.json'), JSON.stringify({ vault: elsewhere, port: 5011 }))
    expect(await inFolder(tmp())).toMatchObject({ code: 0 })
  })
})
