// app/lib/paths.ts
// URL shapes for notes and attachments, shared by the compiler (links in the
// HTML), the server (route parsing) and the client (navigation). Each path
// segment is percent-encoded on its own so "/" keeps meaning "folder".
import type { NoteId } from './types'

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** The inverse of encodePath; null when an escape is malformed (e.g. a bare "%"). */
export function decodePath(encoded: string): string | null {
  try {
    return encoded.split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
}

export function notePath(id: NoteId, heading?: string): string {
  return `/n/${encodePath(id)}${heading ? `#${encodeURIComponent(heading)}` : ''}`
}

export function noteApiPath(id: NoteId): string {
  return `/api/notes/${encodePath(id)}`
}

export function fileUrl(path: string): string {
  return `/api/files/${encodePath(path)}`
}
