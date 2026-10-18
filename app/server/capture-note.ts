// app/server/capture-note.ts
// POST /api/capture: quick capture from the Option-P box, the Raycast extension and the Apple Notes job. Writes one note
// into the Inbox: the first line is its title (file name and `# heading`), the lines after it are the body, and the day
// lives in the `created` property. The browser sends only {text, date}; the file name is built here, so nothing typed can
// choose where a file lands, and an existing note is never overwritten (a clash becomes "Title 2", "Title 3"…).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileNameFor } from '../lib/new-note'
import type { SoiiEnv } from './env'
import { commitLocal } from './local-commit'
import { inVault, isDay, MAX_TEXT } from './log-note'
import type { RunGit } from './sync'
import { canWrite, WRITE_NOT_CONFIGURED } from './write-note'

/** The template's Inbox, the same folder the Log's "Note" kind writes to (app/lib/log.ts). */
export const INBOX_FOLDER = '00-Inbox'

const MAX_CLASHES = 100
const MESSAGE_TITLE = 80

export type CaptureResult =
  | { ok: true; path: string; warning: string | null }
  | { ok: false; status: 400 | 409 | 501; error: string; message: string }

const fail = (status: 400 | 409 | 501, error: string, message: string): Extract<CaptureResult, { ok: false }> => ({ ok: false, status, error, message })

/** Title and body: the first non-empty line (without a leading Markdown heading mark), then everything after it. */
export function splitCapture(text: string): { title: string; body: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const first = lines.findIndex(l => l.trim())
  if (first === -1) return { title: 'Capture', body: '' }
  const title = lines[first].replace(/^\s*#+\s*/, '').replace(/\s+/g, ' ').trim() || 'Capture'
  const body = lines.slice(first + 1).join('\n').replace(/^(\s*\n)+/, '').trimEnd()
  return { title, body }
}

/** `<Inbox>/<Title>.md`, then `<Title> 2.md`, `<Title> 3.md`… for the n-th try. Never a dot-file, which soii and Finder hide. */
export function capturePath(title: string, n = 1): string {
  const name = fileNameFor(title).replace(/^[.\s]+/, '') || 'Capture'
  return `${INBOX_FOLDER}/${name}${n > 1 ? ` ${n}` : ''}.md`
}

/** The note: `created` and the `inbox` tag, `# title`, then the body as typed (line endings normalised). */
export function buildCapture(text: string, date: string): { title: string; content: string } {
  const { title, body } = splitCapture(text)
  return { title, content: `---\ncreated: ${date}\ntags:\n  - inbox\n---\n\n# ${title}\n${body ? `\n${body}\n` : ''}` }
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
  for (let n = 1; n <= MAX_CLASHES; n++) {
    const path = capturePath(note.title, n)
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
    const warning = await commitLocal(env, git, path, `soii: capture "${short(note.title)}"`)
    return { ok: true, path, warning }
  }
  return fail(409, 'exists', `There are already ${MAX_CLASHES} Inbox notes named like that.`)
}

const short = (title: string) => (title.length > MESSAGE_TITLE ? `${title.slice(0, MESSAGE_TITLE - 1)}…` : title)
