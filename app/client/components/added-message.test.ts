import { expect, test } from 'bun:test'
import { localAddedMessage } from './added-message'

const COMMITTED = 'Committed in your local vault (not pushed).'

test('a committed note says so, and points at Sync when Sync exists', () => {
  expect(localAddedMessage('04-Resources/Library/Recipes/Pasta.md', COMMITTED, true)).toBe('Saved and committed 04-Resources/Library/Recipes/Pasta.md. Press Sync to push it.')
  expect(localAddedMessage('a.md', COMMITTED, false)).toBe('Saved and committed a.md.')
})

test('when git did not commit, the reason is shown as it is (it already says "Saved")', () => {
  expect(localAddedMessage('a.md', "Saved, but git didn't commit it: hook failed", true)).toBe("Saved, but git didn't commit it: hook failed")
  expect(localAddedMessage('a.md', 'Saved. The vault folder is not a git repository, so nothing was committed.', true)).toContain('not a git repository')
})

test('an older server that sends no warning still gets a plain message', () => {
  expect(localAddedMessage('a.md', undefined, true)).toBe('Saved a.md.')
  expect(localAddedMessage('a.md', null, false)).toBe('Saved a.md.')
})
