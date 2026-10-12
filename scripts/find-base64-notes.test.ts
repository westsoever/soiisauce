import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeBase64Markdown, findBase64Notes } from './find-base64-notes'

const ENCODED = 'LS0tCmRhdGU6IDIwMjYtMDgtMTAKdGFnczogW2RhaWx5XQotLS0KCiMjIFBsYW4KCldyaXRlIHRoZSBwbGFuLgo='

describe('decodeBase64Markdown', () => {
  test('decodes a note stored as one base64 line', () => {
    expect(decodeBase64Markdown(ENCODED)?.startsWith('---\ndate: 2026-08-10')).toBe(true)
  })
  test('tolerates a trailing newline and wrapped lines', () => {
    expect(decodeBase64Markdown(`${ENCODED.slice(0, 40)}\n${ENCODED.slice(40)}\n`)).not.toBeNull()
  })
  test('ignores ordinary markdown, short words and binary-looking payloads', () => {
    expect(decodeBase64Markdown('# Title\n\nSome text.')).toBeNull()
    expect(decodeBase64Markdown('Plan')).toBeNull()
    expect(decodeBase64Markdown('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV')).toBeNull()
    expect(decodeBase64Markdown('')).toBeNull()
  })
})

describe('findBase64Notes', () => {
  let dir = ''
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'soii-b64-'))
    mkdirSync(join(dir, '01-Daily', '_Templates'), { recursive: true })
    mkdirSync(join(dir, '.obsidian'), { recursive: true })
    writeFileSync(join(dir, '01-Daily', '2026-08-10.md'), ENCODED)
    writeFileSync(join(dir, '01-Daily', '_Templates', 'daily.md'), ENCODED)
    writeFileSync(join(dir, '01-Daily', '2026-08-11.md'), '# Fine\n')
    writeFileSync(join(dir, '.obsidian', 'x.md'), ENCODED)
  })
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('lists encoded notes, sorted, skipping dot-directories', () => {
    expect(findBase64Notes(dir)).toEqual([
      { path: '01-Daily/2026-08-10.md', firstLine: '---' },
      { path: '01-Daily/_Templates/daily.md', firstLine: '---' }
    ])
  })
})
