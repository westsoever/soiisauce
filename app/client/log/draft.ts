// app/client/log/draft.ts
// The unsent Log, kept in localStorage until the server says 201, so a dropped connection, a
// reload or closing the tab never loses what you typed. One draft at a time.
import { readJson, removeKey, storageKeys, writeJson } from '../lib/storage'

export type LogTarget = { mode: 'new'; title: string } | { mode: 'append'; path: string; title: string }

export interface LogDraft {
  kind: string
  target: LogTarget | null
  values: Record<string, string>
  text: string
  date: string
  how: string | null
}

export function parseDraft(raw: unknown): LogDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  if (typeof d.kind !== 'string' || typeof d.text !== 'string' || typeof d.date !== 'string') return null
  const values =
    d.values && typeof d.values === 'object' && !Array.isArray(d.values)
      ? (Object.fromEntries(Object.entries(d.values).filter(([, v]) => typeof v === 'string')) as Record<string, string>)
      : {}
  const t = d.target && typeof d.target === 'object' ? (d.target as Record<string, unknown>) : null
  let target: LogTarget | null = null
  if (t && typeof t.title === 'string') {
    if (t.mode === 'new') target = { mode: 'new', title: t.title }
    else if (t.mode === 'append' && typeof t.path === 'string') target = { mode: 'append', path: t.path, title: t.title }
  }
  return { kind: d.kind, target, values, text: d.text, date: d.date, how: typeof d.how === 'string' ? d.how : null }
}

/** A draft is worth keeping once it holds anything beyond the kind's defaults. */
export function isWorthKeeping(d: LogDraft, defaults: Record<string, string>): boolean {
  if (d.text.trim()) return true
  if (d.target && (d.target.mode === 'append' || d.target.title.trim())) return true
  return Object.entries(d.values).some(([k, v]) => v !== '' && v !== (defaults[k] ?? ''))
}

export function loadDraft(): LogDraft | null {
  return parseDraft(readJson<unknown>(storageKeys.logDraft, null))
}

export function saveDraft(d: LogDraft, defaults: Record<string, string>): void {
  if (isWorthKeeping(d, defaults)) writeJson(storageKeys.logDraft, d)
  // An empty form only clears its own kind's draft, never another kind's unsent one.
  else if (loadDraft()?.kind === d.kind) removeKey(storageKeys.logDraft)
}

export function clearDraft(): void {
  removeKey(storageKeys.logDraft)
}
