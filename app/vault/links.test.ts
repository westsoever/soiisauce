// app/vault/links.test.ts
import { describe, expect, test } from 'bun:test'
import { createLinkResolver, parseWikiTarget } from './links'

const resolve = createLinkResolver([
  'index.md',
  'People/Anna.md',
  'Archive/People/Anna.md',
  'Books/Dune.md',
  'Weird/Café & ? 100%.md',
  'notes/sub/page.md',
  'assets/cover.svg'
])

describe('createLinkResolver', () => {
  test('exact vault path, with or without .md', () => {
    expect(resolve('Archive/People/Anna', 'index.md')).toBe('Archive/People/Anna.md')
    expect(resolve('Books/Dune.md', 'index.md')).toBe('Books/Dune.md')
  })
  test('duplicate basenames: shortest path wins', () => {
    expect(resolve('Anna', 'index.md')).toBe('People/Anna.md')
    expect(resolve('anna', 'Books/Dune.md')).toBe('People/Anna.md')
  })
  test('partial path suffix', () => {
    expect(resolve('People/Anna', 'x.md')).toBe('People/Anna.md')
    expect(resolve('sub/page', 'x.md')).toBe('notes/sub/page.md')
  })
  test('relative markdown links', () => {
    expect(resolve('../Dune.md', 'Books/x/y.md')).toBe('Books/Dune.md')
    expect(resolve('./page.md', 'notes/sub/other.md')).toBe('notes/sub/page.md')
  })
  test('attachments by basename with extension; notes never match attachments', () => {
    expect(resolve('cover.svg', 'Books/Dune.md')).toBe('assets/cover.svg')
    expect(resolve('cover', 'Books/Dune.md')).toBeNull()
  })
  test('unicode and punctuation in names; missing targets', () => {
    expect(resolve('Café & ? 100%', 'index.md')).toBe('Weird/Café & ? 100%.md')
    expect(resolve('Ghost', 'index.md')).toBeNull()
    expect(resolve('  ', 'index.md')).toBeNull()
  })
})

describe('parseWikiTarget', () => {
  test('target, heading, alias, block refs', () => {
    expect(parseWikiTarget('Dune')).toEqual({ target: 'Dune', heading: null, alias: null })
    expect(parseWikiTarget('Dune#Plot|the plot')).toEqual({ target: 'Dune', heading: 'Plot', alias: 'the plot' })
    expect(parseWikiTarget('#Local')).toEqual({ target: '', heading: 'Local', alias: null })
    expect(parseWikiTarget('Dune#^abc123')).toEqual({ target: 'Dune', heading: null, alias: null })
    expect(parseWikiTarget('cover.png|300')).toEqual({ target: 'cover.png', heading: null, alias: '300' })
  })
})
