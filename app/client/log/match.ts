// app/client/log/match.ts
// "Which one?" in the Log: the notes a kind can append to, filtered by what you type.
// Client-side over the vault index, so it works instantly and offline.
import type { LogKind } from '../../lib/log'
import type { NoteMeta } from '../../lib/types'

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const recency = (n: NoteMeta) => n.lastSeen ?? n.updated ?? n.date ?? ''

export function candidatesFor(kind: LogKind, notes: NoteMeta[], query: string, limit = 8): NoteMeta[] {
  const pool = kind.type ? notes.filter(n => n.type === kind.type) : notes
  const q = fold(query)
  if (!q) return [...pool].sort((a, b) => recency(b).localeCompare(recency(a)) || a.title.localeCompare(b.title)).slice(0, limit)
  const scored: { note: NoteMeta; score: number }[] = []
  for (const note of pool) {
    const t = fold(note.title)
    const score = t.startsWith(q) ? 0 : t.split(/[\s\-_(]+/).some(w => w.startsWith(q)) ? 1 : t.includes(q) ? 2 : -1
    if (score >= 0) scored.push({ note, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.note.title.localeCompare(b.note.title))
    .slice(0, limit)
    .map(s => s.note)
}

/** One muted line under a match: relationship for people, author/status for media, else the folder. */
export function detailFor(note: NoteMeta): string {
  const f = note.frontmatter
  const pick = (k: string) => (typeof f[k] === 'string' || typeof f[k] === 'number' ? String(f[k]) : '')
  if (note.type === 'person') return [pick('relationship'), pick('company')].filter(Boolean).join(' · ')
  if (note.type) return [pick('author') || pick('director'), pick('status')].filter(Boolean).join(' · ')
  return note.folder
}
