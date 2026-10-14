// app/lib/config.test.ts
import { describe, expect, test } from 'bun:test'
import { ConfigError } from './config-schema'
import { DEFAULT_CONFIG } from './default-config'
import { resolveConfig } from './merge-config'

const tab = (id: string, view = 'list') => ({ id, title: id, view, query: { type: 'book' } })

describe('currency config', () => {
  test('display currency and your own rates are kept', () => {
    const config = resolveConfig({ currency: { display: 'DKK', rates: { USD: 1.1 } } })
    expect(config.currency).toEqual({ display: 'DKK', rates: { USD: 1.1 } })
  })
  test('left out, the config has no currency key', () => {
    expect('currency' in resolveConfig({})).toBe(false)
  })
  test('a bad code or a non-positive rate is an error', () => {
    expect(() => resolveConfig({ currency: { display: 'kroner' } })).toThrow(ConfigError)
    expect(() => resolveConfig({ currency: { rates: { USD: 0 } } })).toThrow(ConfigError)
    expect(() => resolveConfig({ currency: { rates: { dollars: 1 } } })).toThrow(ConfigError)
  })
})

describe('resolveConfig', () => {
  test('no config file means the defaults, validated', () => {
    expect(resolveConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(resolveConfig({})).toEqual(DEFAULT_CONFIG)
  })

  test('default workspaces and tab ids are the fixed contract', () => {
    const ids = Object.fromEntries(DEFAULT_CONFIG.workspaces.map(w => [w.id, w.tabs.map(t => t.id)]))
    expect(ids).toEqual({
      today: ['brief', 'weekly'],
      inbox: ['inbox'],
      library: ['books', 'audiobooks', 'movies', 'documentaries', 'videos', 'research', 'articles', 'recipes', 'journal'],
      people: ['overview', 'friends', 'network', 'all'],
      finance: ['overview', 'subscriptions', 'accounts', 'expenses', 'notes'],
      goals: ['board', 'years', 'bucket'],
      projects: ['board']
    })
    expect(DEFAULT_CONFIG.home).toBe('today')
  })

  test('a user workspace with a default id replaces it in place; a new id is appended', () => {
    const config = resolveConfig({
      workspaces: [
        { id: 'people', title: 'Contacts', tabs: [tab('everyone', 'table')] },
        { id: 'reading', title: 'Reading', tabs: [tab('now')] }
      ]
    })
    expect(config.workspaces.map(w => w.id)).toEqual(['inbox', 'today', 'library', 'people', 'finance', 'goals', 'projects', 'reading'])
    expect(config.workspaces[3].title).toBe('Contacts')
  })

  test('replaceDefaultWorkspaces drops the defaults', () => {
    const config = resolveConfig({ replaceDefaultWorkspaces: true, workspaces: [{ id: 'mine', title: 'Mine', tabs: [tab('a')] }] })
    expect(config.workspaces.map(w => w.id)).toEqual(['mine'])
  })

  test('types merge by key; scalars and exclude are overridden', () => {
    const config = resolveConfig({ title: 'Brain', home: 'library', exclude: ['Private/**'], types: { book: ['novel'], recipe: ['recipe'] } })
    expect(config.types.book).toEqual(['novel'])
    expect(config.types.recipe).toEqual(['recipe'])
    expect(config.types.movie).toEqual(DEFAULT_CONFIG.types.movie)
    expect(config.title).toBe('Brain')
    expect(config.home).toBe('library')
    expect(config.exclude).toEqual(['Private/**'])
  })

  test('a typo in a view name names the YAML path and the valid views', () => {
    const run = () => resolveConfig({ workspaces: [{ id: 'x', title: 'X', tabs: [tab('a', 'galery')] }] })
    expect(run).toThrow(ConfigError)
    expect(run).toThrow('soii.config.yml: workspaces[0].tabs[0].view: "galery" is not one of list, table, gallery, board, stats, feed')
  })

  test('unknown keys and missing fields are reported with their path', () => {
    expect(() => resolveConfig({ workspace: [] })).toThrow('soii.config.yml: unknown key "workspace"')
    expect(() => resolveConfig({ workspaces: [{ id: 'x', tabs: [tab('a')] }] })).toThrow('soii.config.yml: workspaces[0].title: is required')
  })

  test('a bad query clause points inside the query', () => {
    expect(() =>
      resolveConfig({ workspaces: [{ id: 'x', title: 'X', tabs: [{ id: 'a', title: 'A', view: 'list', query: { typ: 'book' } }] }] })
    ).toThrow('soii.config.yml: workspaces[0].tabs[0].query: unknown key "typ"')
  })

  test('duplicate workspace or tab ids are rejected', () => {
    expect(() => resolveConfig({ replaceDefaultWorkspaces: true, workspaces: [
      { id: 'a', title: 'A', tabs: [tab('t')] },
      { id: 'a', title: 'B', tabs: [tab('t')] }
    ] })).toThrow('duplicate workspace id "a"')
    expect(() => resolveConfig({ workspaces: [{ id: 'x', title: 'X', tabs: [tab('t'), tab('t')] }] })).toThrow('duplicate tab id "t" in workspace "x"')
  })

  describe('empty arrays in query fields are rejected (they would match nothing)', () => {
    const withQuery = (query: unknown) => () =>
      resolveConfig({ workspaces: [{ id: 'x', title: 'X', tabs: [{ id: 'a', title: 'A', view: 'list', query }] }] })
    const at = (path: string) => `soii.config.yml: workspaces[0].tabs[0].query${path}: must not be empty: an empty list matches no notes`

    test('type, path and tag', () => {
      expect(withQuery({ type: [] })).toThrow(ConfigError)
      expect(withQuery({ type: [] })).toThrow(at('.type'))
      expect(withQuery({ path: [] })).toThrow(at('.path'))
      expect(withQuery({ tag: [] })).toThrow(at('.tag'))
    })

    test('where values, and inside a clause list', () => {
      expect(withQuery({ type: 'book', where: { status: [] } })).toThrow(at('.where.status'))
      expect(withQuery([{ type: 'book' }, { tag: [] }])).toThrow(at('[1].tag'))
    })

    test('an empty query list', () => {
      expect(withQuery([])).toThrow('soii.config.yml: workspaces[0].tabs[0].query: must not be empty')
    })

    test('non-empty arrays and scalars still validate', () => {
      expect(withQuery({ type: ['book'], path: 'a/**', tag: ['x', 'y'], where: { status: ['a'], n: 1, ok: true } })).not.toThrow()
    })
  })
})

test('Finance has an Expenses tab for logged expenses, newest first', () => {
  expect(DEFAULT_CONFIG.types.expense).toEqual(['expense', 'purchase'])
  const finance = DEFAULT_CONFIG.workspaces.find(w => w.id === 'finance')
  const tab = finance?.tabs.find(t => t.id === 'expenses')
  expect(tab).toMatchObject({ view: 'table', query: { type: 'expense' }, sort: [{ field: 'date', dir: 'desc' }] })
  expect(finance?.tabs.map(t => t.id)).toEqual(['overview', 'subscriptions', 'accounts', 'expenses', 'notes'])
})
