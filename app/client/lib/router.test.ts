// app/client/lib/router.test.ts
import { describe, expect, test } from 'bun:test'
import { notePath } from '../../lib/paths'
import { logPath, parseRoute, workspacePath } from './router'

describe('parseRoute', () => {
  const cases: [string, unknown][] = [
    ['/', { page: 'home' }],
    ['/vault', { page: 'vault' }],
    ['/w/library', { page: 'workspace', workspace: 'library', tab: undefined }],
    ['/w/library/books', { page: 'workspace', workspace: 'library', tab: 'books' }],
    ['/n/05-Knowledge/People/Anna', { page: 'note', id: '05-Knowledge/People/Anna' }],
    ['/n/Weird/Caf%C3%A9%20%26%20%3F%20100%25', { page: 'note', id: 'Weird/Café & ? 100%' }],
    ['/n/bad%E0%A4%A', { page: 'not-found' }],
    ['/n', { page: 'not-found' }],
    ['/w', { page: 'not-found' }],
    ['/w/a/b/c', { page: 'not-found' }],
    ['/vault/x', { page: 'not-found' }],
    ['/nope', { page: 'not-found' }],
    ['/log', { page: 'log' }],
    ['/log/book', { page: 'log', kind: 'book' }],
    ['/log/a/b', { page: 'not-found' }]
  ]
  for (const [path, route] of cases) test(path, () => expect(parseRoute(path)).toEqual(route as never))

  test('logPath', () => {
    expect(logPath()).toBe('/log')
    expect(logPath('conversation')).toBe('/log/conversation')
  })

  test('notePath round-trips through parseRoute for awkward ids', () => {
    for (const id of ['a', 'Folder/Sub/Note', 'Weird/Café & ? 100%', '日本/ノート #1']) {
      expect(parseRoute(notePath(id).split('#')[0])).toEqual({ page: 'note', id })
    }
  })

  test('workspacePath', () => {
    expect(workspacePath('library')).toBe('/w/library')
    expect(workspacePath('library', 'books')).toBe('/w/library/books')
  })
})
