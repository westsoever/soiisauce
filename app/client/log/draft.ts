// app/client/log/draft.ts
// The unsent Log, kept in localStorage until the server says 201, so a dropped connection, a
// reload or closing the tab never loses what you typed. One draft at a time.
import { readJson, removeKey, storageKeys, writeJson } from '../lib/storage'

export interface LogDraft {
  kind: string
  title: string
  values: Record<string, string>
  text: string
  date: string
}

export function parseDraft(raw: unknown): LogDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  if (typeof d.kind !== 'string' || typeof d.text !== 'string' || typeof d.date !== 'string') return null
  const values =
    d.values && typeof d.values === 'object' && !Array.isArray(d.values)
      ? (Object.fromEntries(Object.entries(d.values).filter(([, v]) => typeof v === 'string')) as Record<string, string>)
      : {}
  // Drafts from before the Log only created notes kept { target: { mode, title } }; a new one's title carries over.
  const t = d.target && typeof d.target === 'object' ? (d.target as Record<string, unknown>) : null
  const title = typeof d.title === 'string' ? d.title : t?.mode === 'new' && typeof t.title === 'string' ? t.title : ''
  return { kind: d.kind, title, values, text: d.text, date: d.date }
}

/** A draft is worth keeping once it holds anything beyond the kind's defaults. */
export function isWorthKeeping(d: LogDraft, defaults: Record<string, string>): boolean {
  if (d.text.trim() || d.title.trim()) return true
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
