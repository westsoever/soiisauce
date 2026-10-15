// app/server/capture-note.ts
// POST /api/capture: the Option-P quick capture. Writes one note into the Inbox in /soii-capture's format
// (.claude/skills/soii-capture/SKILL.md). The browser sends only {text, date}; the file name is built here, so nothing
// typed can choose where a file lands, and an existing note is never overwritten (a clash becomes -2, -3…).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SoiiEnv } from './env'
import { commitLocal } from './local-commit'
import { inVault, isDay, MAX_TEXT } from './log-note'
import type { RunGit } from './sync'
import { canWrite, WRITE_NOT_CONFIGURED } from './write-note'

/** The template's Inbox, the same folder the Log's "Note" kind writes to (app/lib/log.ts). */
export const INBOX_FOLDER = '00-Inbox'

const TITLE_WORDS = 8
const TITLE_CHARS = 80
const SLUG_WORDS = 6
const SLUG_CHARS = 50
const MAX_CLASHES = 100

export type CaptureResult =
  | { ok: true; path: string; warning: string | null }
  | { ok: false; status: 400 | 409 | 501; error: string; message: string }

const fail = (status: 400 | 409 | 501, error: string, message: string): Extract<CaptureResult, { ok: false }> => ({ ok: false, status, error, message })

/** The first words of the first line, as a person would write them; a leading Markdown heading mark is dropped. */
export function captureTitle(text: string): string {
  const first = text.split('\n').find(l => l.trim()) ?? ''
  const words = first.replace(/^\s*#+\s*/, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  let title = words.slice(0, TITLE_WORDS).join(' ')
  if (title.length > TITLE_CHARS) title = title.slice(0, TITLE_CHARS).replace(/\s+\S*$/, '') || title.slice(0, TITLE_CHARS)
  return title || 'Capture'
}

/** A short lowercase slug from the first few words; "capture" when nothing is left (an emoji, punctuation). */
export function captureSlug(text: string): string {
  const words = captureTitle(text).split(' ').slice(0, SLUG_WORDS).join(' ')
  const slug = words
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_CHARS)
    .replace(/-+$/, '')
  return slug || 'capture'
}

/** `<Inbox>/<date>-<slug>.md`, then `-2`, `-3`… for the n-th try. */
export function capturePath(date: string, slug: string, n = 1): string {
  return `${INBOX_FOLDER}/${date}-${slug}${n > 1 ? `-${n}` : ''}.md`
}

/** The note: `created` and the `inbox` tag, the title, then the text exactly as typed (line endings normalised). */
export function buildCapture(text: string, date: string): { title: string; content: string } {
  const body = text.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '')
  const title = captureTitle(body)
  return { title, content: `---\ncreated: ${date}\ntags:\n  - inbox\n---\n\n# ${title}\n\n${body}\n` }
}

export function parseCapture(body: unknown): { ok: true; text: string; date: string } | Extract<CaptureResult, { ok: false }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'bad_request', 'That capture could not be read.')
  const { text, date } = body as Record<string, unknown>
  if (typeof text !== 'string') return fail(400, 'bad_request', 'That capture could not be read.')
  if (!text.trim()) return fail(400, 'empty', 'Write something first.')
  if (text.length > MAX_TEXT) return fail(400, 'too_long', 'That is too long for a quick capture.')
  if (!isDay(date)) return fail(400, 'bad_date', 'That capture could not be read.')
  return { ok: true, text, date }
}

export async function captureNote(env: SoiiEnv, body: unknown, git: RunGit): Promise<CaptureResult> {
  const input = parseCapture(body)
  if (!input.ok) return input
  if (!canWrite(env)) return fail(501, 'write_not_configured', WRITE_NOT_CONFIGURED)
  const note = buildCapture(input.text, input.date)
  const slug = captureSlug(note.title)
  for (let n = 1; n <= MAX_CLASHES; n++) {
    const path = capturePath(input.date, slug, n)
    const file = inVault(env, path)
    if (!file) return fail(400, 'bad_path', 'That makes an invalid file name.')
    mkdirSync(dirname(file), { recursive: true })
    try {
      // 'wx' fails if the file exists, so two captures at once can't overwrite each other.
      writeFileSync(file, note.content, { flag: 'wx' })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw err
    }
    const warning = await commitLocal(env, git, path, `soii: capture "${note.title}"`)
    return { ok: true, path, warning }
  }
  return fail(409, 'exists', `There are already ${MAX_CLASHES} captures named like that today.`)
}
