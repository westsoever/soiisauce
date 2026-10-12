// app/lib/view-edit.test.ts
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { DEFAULT_CONFIG } from './default-config'
import { resolveConfig } from './merge-config'
import { addTab, removeTab, setTabQuery, setTabSort, slugify, type EditResult } from './view-edit'

const TEMPLATE = readFileSync(join(import.meta.dir, '../../template/soii.config.yml'), 'utf8')
const CONFIG = `# my config
title: Sam
workspaces:
  - id: projects
    title: Projects
    icon: briefcase
    tabs:
      # the board
      - id: board
        title: Board
        view: board
        query: { type: project }
        options: { groupBy: status, groups: [idea, active, done], subtitle: area }
`
const ok = (r: EditResult) => {
  if (!r.ok) throw new Error(`${r.error}: ${r.message}`)
  return r
}
const tabsOf = (yaml: string, ws: string) => resolveConfig(parse(yaml)).workspaces.find(w => w.id === ws)!.tabs

describe('slugify', () => {
  test('makes a valid tab id', () => {
    expect(slugify('Sci-fi books')).toBe('sci-fi-books')
    expect(slugify('  Café   Résumés!! ')).toBe('cafe-resumes')
    expect(slugify('📚')).toBe('view')
    expect(slugify('!!!')).toBe('view')
  })
})

describe('addTab', () => {
  test('appends to a workspace in the file and keeps comments and flow style', () => {
    const r = ok(addTab(CONFIG, 'projects', { title: 'Active', view: 'list', query: { type: 'project', where: { status: 'active' } } }))
    expect(r.tabId).toBe('active')
    expect(r.title).toBe('Active')
    expect(r.yaml.startsWith(CONFIG)).toBe(true)
    expect(r.yaml).toContain('# the board')
    expect(r.yaml).toContain('query: { type: project, where: { status: active } }')
    expect(tabsOf(r.yaml, 'projects').map(t => t.id)).toEqual(['board', 'active'])
  })
  test('copies a built-in workspace whole before adding to it', () => {
    const r = ok(addTab(CONFIG, 'people', { title: 'TechBBQ', view: 'table', query: { type: 'person', where: { relationship: 'techbbq' } } }))
    const builtIn = DEFAULT_CONFIG.workspaces.find(w => w.id === 'people')!
    expect(tabsOf(r.yaml, 'people').map(t => t.id)).toEqual([...builtIn.tabs.map(t => t.id), 'techbbq'])
    expect(tabsOf(r.yaml, 'people')[0]).toEqual(builtIn.tabs[0])
  })
  test('works with no file at all', () => {
    const r = ok(addTab(null, 'goals', { title: 'Big ones', view: 'list', query: { type: 'goal' } }))
    expect(tabsOf(r.yaml, 'goals').at(-1)!.id).toBe('big-ones')
  })
  test('id collisions: a made-up id gets -2, an explicit id is refused', () => {
    const r = ok(addTab(CONFIG, 'projects', { title: 'Board', view: 'list', query: {} }))
    expect(r.tabId).toBe('board-2')
    const clash = addTab(CONFIG, 'projects', { id: 'board', title: 'X', view: 'list', query: {} })
    expect(clash).toMatchObject({ ok: false, status: 409, error: 'tab_exists' })
  })
  test('refuses an unknown workspace and never creates one', () => {
    expect(addTab(CONFIG, 'recipes-new', { title: 'X', view: 'list', query: {} })).toMatchObject({ ok: false, status: 400, error: 'unknown_workspace' })
    expect(addTab('replaceDefaultWorkspaces: true\nworkspaces:\n' + CONFIG.split('workspaces:\n')[1], 'people', { title: 'X', view: 'list', query: {} })).toMatchObject({
      ok: false,
      error: 'unknown_workspace'
    })
  })
  test('refuses to touch a config that does not load, and an invalid tab', () => {
    const broken = addTab('workspaces:\n  - id: projects\n    tabs: []\n', 'projects', { title: 'X', view: 'list', query: {} })
    expect(broken).toMatchObject({ ok: false, status: 400, error: 'bad_config' })
    expect((broken as { message: string }).message).toStartWith('Fix soii.config.yml first: ')
    expect(addTab('title: [unclosed\n', 'projects', { title: 'X', view: 'list', query: {} })).toMatchObject({ error: 'bad_config' })
    const invalid = addTab(CONFIG, 'projects', { title: 'X', view: 'galery' as never, query: {} })
    expect(invalid).toMatchObject({ ok: false, status: 400, error: 'invalid_view' })
    expect((invalid as { message: string }).message).toContain('soii.config.yml: workspaces[0].tabs[1].view')
  })
  test('the template config survives an add and a remove byte for byte', () => {
    const added = ok(addTab(TEMPLATE, 'projects', { title: 'Ideas', view: 'list', query: { type: 'project', where: { status: 'idea' } } }))
    expect(ok(removeTab(added.yaml, 'projects', 'ideas')).yaml).toBe(TEMPLATE)
  })
  test('never reprints lines it does not change: lists stay unpadded', () => {
    const r = ok(addTab(CONFIG, 'projects', { title: 'A', view: 'board', query: { type: 'project' }, options: { groupBy: 'status', groups: ['idea', 'done'] } }))
    expect(r.yaml).toContain('groups: [idea, active, done]')
    expect(r.yaml).toContain('options: { groupBy: status, groups: [idea, done] }')
  })
  test('values that need quotes are quoted and read back', () => {
    const r = ok(addTab(CONFIG, 'projects', { title: 'Odd: one, two', view: 'list', query: { path: '**/Finance/**', where: { status: 'true', note: 'a, b' } } }))
    expect(tabsOf(r.yaml, 'projects').at(-1)).toMatchObject({ title: 'Odd: one, two', query: { path: '**/Finance/**', where: { status: 'true', note: 'a, b' } } })
  })
})

describe('removeTab', () => {
  test('removes a tab, refuses the last one and unknown ones', () => {
    const two = ok(addTab(CONFIG, 'projects', { title: 'Active', view: 'list', query: {} })).yaml
    expect(tabsOf(ok(removeTab(two, 'projects', 'board')).yaml, 'projects').map(t => t.id)).toEqual(['active'])
    expect(removeTab(CONFIG, 'projects', 'board')).toMatchObject({ ok: false, status: 409, error: 'last_tab' })
    expect(removeTab(CONFIG, 'projects', 'nope')).toMatchObject({ ok: false, status: 400, error: 'unknown_tab' })
  })
  test('removing from a built-in workspace copies it first', () => {
    const r = ok(removeTab(CONFIG, 'people', 'network'))
    expect(tabsOf(r.yaml, 'people').map(t => t.id)).not.toContain('network')
    expect(tabsOf(r.yaml, 'people').length).toBe(DEFAULT_CONFIG.workspaces.find(w => w.id === 'people')!.tabs.length - 1)
  })
})

describe('setTabSort and setTabQuery', () => {
  test('sort changes only sort; an empty sort removes the key', () => {
    const r = ok(setTabSort(CONFIG, 'projects', 'board', [{ field: 'title', dir: 'asc' }]))
    expect(r.yaml).toMatch(/sort: \[ ?\{ field: title, dir: asc \} ?\]/)
    const t = tabsOf(r.yaml, 'projects')[0]
    expect(t.sort).toEqual([{ field: 'title', dir: 'asc' }])
    expect(t.query).toEqual({ type: 'project' })
    expect(tabsOf(ok(setTabSort(r.yaml, 'projects', 'board', [])).yaml, 'projects')[0].sort).toBeUndefined()
  })
  test('query changes only query', () => {
    const r = ok(setTabQuery(CONFIG, 'projects', 'board', { type: 'project', where: { area: 'work' } }))
    const t = tabsOf(r.yaml, 'projects')[0]
    expect(t.query).toEqual({ type: 'project', where: { area: 'work' } })
    expect(t.options).toEqual({ groupBy: 'status', groups: ['idea', 'active', 'done'], subtitle: 'area' })
    expect(t.view).toBe('board')
    expect(setTabQuery(CONFIG, 'projects', 'board', [])).toMatchObject({ ok: false, error: 'invalid_view' })
  })
})

// Block-style values (the shipped template writes `query:` as an indented list): the splice must stop where the value
// ends, not swallow the line break, blank lines or comments that follow it.
describe('block-style query and sort', () => {
  const BLOCK = `workspaces:
  - id: projects
    title: Projects
    tabs:
      - id: board
        title: Board
        view: list
        query:
          - { type: project }
          - { path: "**/x/**" }
        # keep me
        options: { subtitle: area }
        sort:
          - { field: title, dir: asc }
          - { field: date, dir: desc }

      # the inbox
      - id: inbox
        title: Inbox
        view: list
        query:
          - { type: note }
  - id: other
    title: Other
    tabs:
      - { id: a, title: A, view: list, query: {} }
`
  test('setTabQuery on a block query keeps the next line, comments and blank lines', () => {
    const r = ok(setTabQuery(BLOCK, 'projects', 'board', { type: 'book' }))
    expect(r.yaml).toContain('        query: { type: book }\n        # keep me\n        options: { subtitle: area }\n')
    expect(tabsOf(r.yaml, 'projects')[0].query).toEqual({ type: 'book' })
    const last = ok(setTabQuery(BLOCK, 'projects', 'inbox', { type: 'book' }))
    expect(last.yaml).toContain('        query: { type: book }\n  - id: other')
  })
  test('setTabSort on a block sort keeps the blank line and the comment after it', () => {
    const r = ok(setTabSort(BLOCK, 'projects', 'board', [{ field: 'title', dir: 'desc' }]))
    expect(r.yaml).toContain('        sort: [{ field: title, dir: desc }]\n\n      # the inbox\n      - id: inbox')
    const none = ok(setTabSort(BLOCK, 'projects', 'board', []))
    expect(none.yaml).toContain('options: { subtitle: area }\n\n      # the inbox')
    expect(tabsOf(none.yaml, 'projects')[0].sort).toBeUndefined()
  })
  test('the template: filtering today/brief and today/journal changes only those lines', () => {
    const brief = ok(setTabQuery(TEMPLATE, 'today', 'brief', { type: 'daily-brief' }))
    expect(brief.yaml).toContain('        query: { type: daily-brief }\n      - id: weekly')
    const journal = ok(setTabQuery(TEMPLATE, 'today', 'journal', { type: 'journal' }))
    expect(journal.yaml).toContain('        query: { type: journal }\n\n  - id: projects')
    const block = '        query:\n          - { type: journal }\n          - { path: "01-Daily/20??-??-??.md" }\n'
    expect(TEMPLATE).toContain(block)
    expect(journal.yaml).toBe(TEMPLATE.replace(block, '        query: { type: journal }\n'))
  })
})

describe('removeTab comments', () => {
  test('keeps a commented-out key of the tab above; takes the comment that sits at the removed tab', () => {
    const text = `workspaces:
  - id: projects
    title: Projects
    tabs:
      - id: board
        title: Board
        view: list
        query: {}
        # options: { subtitle: area }
      # the inbox
      - id: inbox
        title: Inbox
        view: list
        query: {}
`
    const r = ok(removeTab(text, 'projects', 'inbox'))
    expect(r.yaml).toContain('        # options: { subtitle: area }\n')
    expect(r.yaml).not.toContain('# the inbox')
  })
})
