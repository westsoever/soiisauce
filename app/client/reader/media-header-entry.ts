// The media ReaderHeader (spec §11), kept out of headers.ts so that file stays a plain
// registry: headers.ts → this entry → MediaHeader → media-facts (no import cycle).
import type { ReaderHeader } from './headers'
import { MEDIA_HIDE_FIELDS, MEDIA_TYPES } from './media-facts'
import { MediaHeader } from './MediaHeader'

export const mediaHeader: ReaderHeader = {
  id: 'media',
  match: note => note.type !== null && MEDIA_TYPES.has(note.type),
  Component: MediaHeader,
  hideFields: MEDIA_HIDE_FIELDS
}
