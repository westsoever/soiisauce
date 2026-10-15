// app/server/capture-note.test.ts
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSoiiApp } from './app'
import { buildCapture, captureNote, captureSlug, captureTitle } from './capture-note'
import { readEnv } from './env'
import { MAX_TEXT } from './log-note'
import type { RunGit } from './sync'

const DATE = '2026-10-16'
const noGit: RunGit = async () => ({ code: 0, out: '' })
const vault = () => mkdtempSync(join(tmpdir(), 'soii-capture-'))
const capture = (root: string, body: unknown) => captureNote(readEnv({ VAULT_PATH: root }), body, noGit)

describe('the note', () => {
  test('matches /soii-capture: created, the inbox tag, a title, then the text as typed', () => {
    const text = 'Call the bakery about Saturday\n\n  - ask about gluten-free\n- and the price'
    expect(buildCapture(text, DATE)).toEqual({
      title: 'Call the bakery about Saturday',
      content: `---\ncreated: ${DATE}\ntags:\n  - inbox\n---\n\n# Call the bakery about Saturday\n\n${text}\n`
    })
  })

  test('the title is the first few words of the first line, without a heading mark', () => {
    expect(captureTitle('\n\n# An idea: what if   soii could listen')).toBe('An idea: what if soii could listen')
    expect(captureTitle('one two three four five six seven eight nine ten')).toBe('one two three four five six seven eight')
    expect(captureTitle('x'.repeat(200)).length).toBe(80)
  })

  test('the slug is short, lowercase and plain', () => {
    expect(captureSlug('Café résumé: what IF?! soii could listen to me')).toBe('cafe-resume-what-if-soii-could')
    expect(captureSlug('🌱🌱')).toBe('capture')
    expect(captureSlug('../../etc/passwd')).toBe('etc-passwd')
  })

  test('Windows line endings become plain newlines', () => {
    expect(buildCapture('a\r\nb\rc', DATE).content.endsWith('# a\n\na\nb\nc\n')).toBe(true)
  })
})

describe('writing it', () => {
  test('lands in the Inbox as <date>-<slug>.md', async () => {
    const root = vault()
    const result = await capture(root, { text: 'Remember the milk', date: DATE })
    expect(result).toEqual({ ok: true, path: `00-Inbox/${DATE}-remember-the-milk.md`, warning: expect.any(String) })
    expect(readFileSync(join(root, '00-Inbox', `${DATE}-remember-the-milk.md`), 'utf8')).toContain('# Remember the milk\n\nRemember the milk\n')
  })

  test('a taken name gets -2, -3, and the existing note is never touched', async () => {
    const root = vault()
    mkdirSync(join(root, '00-Inbox'))
    writeFileSync(join(root, '00-Inbox', `${DATE}-milk.md`), 'mine\n')
    const a = await capture(root, { text: 'Milk', date: DATE })
    const b = await capture(root, { text: 'milk!', date: DATE })
    expect(a.ok && a.path).toBe(`00-Inbox/${DATE}-milk-2.md`)
    expect(b.ok && b.path).toBe(`00-Inbox/${DATE}-milk-3.md`)
    expect(readFileSync(join(root, '00-Inbox', `${DATE}-milk.md`), 'utf8')).toBe('mine\n')
  })

  test('empty, too long, malformed or without a valid date is refused and writes nothing', async () => {
    const root = vault()
    for (const [body, error] of [
      [{ text: '   \n\t', date: DATE }, 'empty'],
      [{ text: 'x'.repeat(MAX_TEXT + 1), date: DATE }, 'too_long'],
      [{ text: 42, date: DATE }, 'bad_request'],
      [['hi'], 'bad_request'],
      [null, 'bad_request'],
      [{ text: 'hi', date: '2026-02-30' }, 'bad_date'],
      [{ text: 'hi' }, 'bad_date']
    ] as const) {
      expect(await capture(root, body)).toMatchObject({ ok: false, status: 400, error })
    }
    expect(existsSync(join(root, '00-Inbox'))).toBe(false)
  })

  test('the body cannot choose the path', async () => {
    const root = vault()
    const result = await capture(root, { text: 'hi', date: DATE, path: '../evil.md' })
    expect(result.ok && result.path).toBe(`00-Inbox/${DATE}-hi.md`)
    expect(readdirSync(root)).toEqual(['00-Inbox'])
  })

  test('without a vault folder it says writing is not set up', async () => {
    expect(await captureNote(readEnv({}), { text: 'hi', date: DATE }, noGit)).toMatchObject({ ok: false, status: 501, error: 'write_not_configured' })
  })
})

describe('POST /api/capture', () => {
  const post = (body: unknown, origin: string | null = 'http://localhost') =>
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body)
    })

  test('rejects a missing or foreign Origin', async () => {
    const root = vault()
    const app = createSoiiApp({ env: { VAULT_PATH: root } })
    for (const origin of [null, 'https://evil.example']) {
      expect((await app.fetch(post({ text: 'hi', date: DATE }, origin))).status).toBe(403)
    }
    expect(existsSync(join(root, '00-Inbox'))).toBe(false)
  })

  test('captures for a same-origin request, and answers a bad one with a message', async () => {
    const app = createSoiiApp({ env: { VAULT_PATH: vault() } })
    const res = await app.fetch(post({ text: 'hi there', date: DATE }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ path: `00-Inbox/${DATE}-hi-there.md`, warning: expect.stringContaining('not a git repository') })
    const bad = await app.fetch(post({ text: '', date: DATE }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'empty', message: 'Write something first.' })
  })
})
