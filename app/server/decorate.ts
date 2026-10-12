// Request-time NoteMeta decorators (spec §6.4). Core ships none; Plan 2 pushes
// the cover decorator. Applied to every note /api/vault and /api/notes return.
import type { DecorateCtx, NoteDecorator, NoteMeta } from '../lib/types'
import { coverDecorator } from './covers/decorator'

export const decorators: NoteDecorator[] = []

export function applyDecorators<T extends NoteMeta>(note: T, ctx: DecorateCtx, list: NoteDecorator[] = decorators): T {
  if (list.length === 0) return note
  let current: NoteMeta = note
  for (const decorate of list) current = decorate(current, ctx)
  return { ...note, ...current }
}

decorators.push(coverDecorator)
