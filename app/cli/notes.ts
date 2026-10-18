// app/cli/notes.ts
// Things the person still has to do after an install (put a folder on PATH, tell git who they are). They are collected while
// the command runs and printed once, last, so they are not buried in the middle of the build output. Same text twice is said once.
import type { Ctx } from './context'

const pending = new WeakMap<Ctx, Map<string, string>>()

export function addNote(ctx: Ctx, key: string, text: string): void {
  const notes = pending.get(ctx) ?? new Map<string, string>()
  if (!notes.has(key)) notes.set(key, text)
  pending.set(ctx, notes)
}

export function flushNotes(ctx: Ctx): void {
  const notes = pending.get(ctx)
  if (!notes?.size) return
  pending.delete(ctx)
  for (const text of notes.values()) ctx.out(`\n${text}`)
}
