import { expect, test } from 'bun:test'
import { capturedMessage, isCaptureShortcut } from './capture-shortcut'

const key = (code: string, mods: Partial<Record<'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey', boolean>> = {}) => ({
  code,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods
})

test('Option-P opens capture, whatever character the layout makes of it', () => {
  expect(isCaptureShortcut(key('KeyP', { altKey: true }))).toBe(true)
})

test('P alone, or with other modifiers, does not', () => {
  expect(isCaptureShortcut(key('KeyP'))).toBe(false)
  expect(isCaptureShortcut(key('KeyP', { altKey: true, metaKey: true }))).toBe(false)
  expect(isCaptureShortcut(key('KeyP', { altKey: true, ctrlKey: true }))).toBe(false)
  expect(isCaptureShortcut(key('KeyP', { altKey: true, shiftKey: true }))).toBe(false)
  expect(isCaptureShortcut(key('KeyO', { altKey: true }))).toBe(false)
})

test('the toast names the file, and adds git’s reason only when it did not commit', () => {
  expect(capturedMessage('00-Inbox/2026-10-16-hi.md', 'Committed in your local vault (not pushed).')).toBe('Captured → 00-Inbox/2026-10-16-hi.md')
  expect(capturedMessage('00-Inbox/a.md', 'Saved. The vault folder is not a git repository, so nothing was committed.')).toBe(
    'Captured → 00-Inbox/a.md. The vault folder is not a git repository, so nothing was committed.'
  )
  expect(capturedMessage('00-Inbox/a.md', "Saved, but git didn't commit it: hook failed")).toBe("Captured → 00-Inbox/a.md, but git didn't commit it: hook failed")
  expect(capturedMessage('00-Inbox/a.md', null)).toBe('Captured → 00-Inbox/a.md')
})
