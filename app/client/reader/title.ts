// app/client/reader/title.ts
// Notes often start with "# <title>"; the reader already shows the title, so
// that first H1 is hidden (Review Focus 3).
import type { NoteDoc } from '../../lib/types'

export function hideDuplicateTitle(doc: Pick<NoteDoc, 'title' | 'headings' | 'html'>): boolean {
  const first = doc.headings[0]
  return Boolean(first && first.depth === 1 && first.text === doc.title && doc.html.trimStart().startsWith('<h1'))
}
