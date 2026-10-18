// app/client/lib/sync-confirm.test.ts
import { describe, expect, test } from 'bun:test'
import { confirmedRemotes, needsConfirm, rememberRemote } from './sync-confirm'

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    }
  }
}

describe('needsConfirm', () => {
  test('asks before the first push to a remote', () => {
    expect(needsConfirm('https://github.com/me/notes.git', [])).toBe(true)
  })

  test('does not ask again for a remote already confirmed', () => {
    expect(needsConfirm('https://github.com/me/notes.git', ['https://github.com/me/notes.git'])).toBe(false)
  })

  test('asks again when the remote changes', () => {
    expect(needsConfirm('https://github.com/me/other.git', ['https://github.com/me/notes.git'])).toBe(true)
  })

  test('has nothing to confirm without a remote: the server explains how to connect', () => {
    expect(needsConfirm(null, [])).toBe(false)
  })
})

describe('remembering a confirmed remote', () => {
  test('round-trips through storage', () => {
    const s = memory()
    expect(confirmedRemotes(s)).toEqual([])
    rememberRemote(s, 'a')
    rememberRemote(s, 'b')
    rememberRemote(s, 'a')
    expect(confirmedRemotes(s)).toEqual(['a', 'b'])
  })

  test('garbage in storage means nothing confirmed, not a crash', () => {
    expect(confirmedRemotes(memory({ 'soii.sync.confirmed': '{nope' }))).toEqual([])
    expect(confirmedRemotes(memory({ 'soii.sync.confirmed': '{"a":1}' }))).toEqual([])
    expect(confirmedRemotes(memory({ 'soii.sync.confirmed': '[1,"a",null]' }))).toEqual(['a'])
  })

  test('storage that is missing or throws (private mode) is survivable', () => {
    expect(confirmedRemotes(undefined)).toEqual([])
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      }
    }
    expect(confirmedRemotes(broken)).toEqual([])
    expect(() => rememberRemote(broken, 'a')).not.toThrow()
  })
})
