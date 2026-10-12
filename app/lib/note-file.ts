// app/lib/note-file.ts
// Where a note's NoteDoc lives under api/_generated/vault/notes/ (spec §7.4).
// Build and server only — node:crypto must not reach the client bundle.
import { createHash } from 'node:crypto'
import type { NoteId } from './types'

export function noteFileName(id: NoteId): string {
  return `${createHash('sha1').update(id).digest('hex').slice(0, 16)}.json`
}
