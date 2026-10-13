import { describe, expect, test } from 'bun:test'
import { obsidianUrl, vaultNameFrom } from './obsidian'

describe('obsidianUrl', () => {
  test('encodes vault and path, keeping the .md file', () => {
    expect(obsidianUrl('cos', '05-Knowledge/People/Anna.md')).toBe('obsidian://open?vault=cos&file=05-Knowledge%2FPeople%2FAnna.md')
  })

  test('spaces, brackets, ampersands and non-ASCII survive', () => {
    expect(obsidianUrl('my vault', 'People/Jakob (DDIS) & co/Åse.md')).toBe(
      'obsidian://open?vault=my%20vault&file=People%2FJakob%20(DDIS)%20%26%20co%2F%C3%85se.md'
    )
  })
})

describe('vaultNameFrom', () => {
  test.each([
    [{ VAULT_PATH: '/Users/me/notes' }, 'notes'],
    [{ VAULT_PATH: '~/notes/my vault/' }, 'my vault'],
    [{ VAULT_PATH: '  ' }, null],
    [{}, null]
  ])('%p → %p', (env, name) => {
    expect(vaultNameFrom(env)).toBe(name)
  })
})
