// app/client/reader/headers.ts
// Reader header extension point (spec §6.4). The first header whose match()
// accepts the note replaces the plain title. It renders the title itself, and
// PropertiesPanel hides its hideFields. Plan 2 pushes the media header, Plan 3 the person header.
import type { ComponentType } from 'react'
import { PERSON_FIELDS } from '../../lib/person'
import type { NoteDoc, NoteMeta } from '../../lib/types'
import { mediaHeader } from './media-header-entry'
import { PersonHeader } from './PersonHeader'

export type ReaderHeader = {
  id: string
  match: (note: NoteMeta) => boolean
  Component: ComponentType<{ note: NoteDoc }>
  hideFields: string[]
}

export const readerHeaders: ReaderHeader[] = []
readerHeaders.push({ id: 'person', match: note => note.type === 'person', Component: PersonHeader, hideFields: PERSON_FIELDS })

export function headerFor(note: NoteMeta): ReaderHeader | undefined {
  return readerHeaders.find(h => h.match(note))
}

readerHeaders.push(mediaHeader)
