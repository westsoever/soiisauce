// app/client/log/LogForm.tsx
// /log/<kind>: pick the note (or a new one), a few chips, the text, Log it. The draft is saved
// as you type and cleared only by a 201. "Log it" sits in the header so the iOS keyboard never
// hides it, and again at the end of the form.
import { IconChevronLeft, IconCopy } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { facetSuggestions, libraryRoot, noteCategories, noteCollections } from '../../lib/collections'
import { buildNewNote, creatingKind, fieldsFor, formatEntry, localDay, relationshipOptions, type LogField, type LogKind, type LogRequestBody, type LogResponse } from '../../lib/log'
import type { NoteMeta, VaultIndex } from '../../lib/types'
import { api, HttpError } from '../lib/http'
import { useCapabilities } from '../lib/queries'
import { logPath, navigate } from '../lib/router'
import { toast } from '../lib/toast'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { clearDraft, loadDraft, saveDraft, type LogDraft, type LogTarget } from './draft'
import { Chips, FieldInput, WhenInput } from './FieldInput'
import { LogDone } from './LogDone'
import { TargetPicker } from './TargetPicker'

const asString = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

/** What a field shows when logging on an existing note: list fields resolve like the Library does. */
function baseline(note: NoteMeta | null | undefined, f: LogField): string {
  if (!note) return ''
  if (f.kind !== 'list') return asString(note.frontmatter[f.key])
  return (f.key === 'collection' ? noteCollections(note, libraryRoot(note.type)) : noteCategories(note)).join(', ')
}

function freshDraft(kind: LogKind): LogDraft {
  // Kinds that never append (Expense) start as a new note with their defaults.
  return kind.section
    ? { kind: kind.id, target: null, values: {}, text: '', date: localDay(), how: null }
    : { kind: kind.id, target: { mode: 'new', title: '' }, values: { ...kind.defaults }, text: '', date: localDay(), how: null }
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

export function LogForm({ kind, index }: { kind: LogKind; index: VaultIndex }) {
  const capabilities = useCapabilities().data
  const [initial] = useState(() => {
    const saved = loadDraft()
    return saved && saved.kind === kind.id ? { draft: saved, restored: true } : { draft: freshDraft(kind), restored: false }
  })
  const [draft, setDraft] = useState<LogDraft>(initial.draft)
  const [showRestored, setShowRestored] = useState(initial.restored)
  const [saving, setSaving] = useState(false)
  const [existsPath, setExistsPath] = useState<string | null>(null)
  const [result, setResult] = useState<{ response: LogResponse; title: string } | null>(null)
  // A ref, not just state: two quick taps must never send two logs.
  const savingRef = useRef(false)

  const defaults = creatingKind(kind).defaults
  const suggestions = useMemo(() => {
    const type = creatingKind(kind).type
    return { collection: facetSuggestions(index.notes, type, 'collection'), category: facetSuggestions(index.notes, type, 'category') }
  }, [kind, index.notes])
  const suggestionsFor = (f: LogField) => (f.kind === 'list' ? suggestions[f.key === 'collection' ? 'collection' : 'category'] : undefined)
  // Relationship offers the generic choices plus the ones this vault's people already have.
  const relationships = useMemo(() => relationshipOptions(index.notes), [index.notes])
  const withVaultOptions = (f: LogField): LogField => (f.key === 'relationship' && f.kind === 'select' ? { ...f, options: relationships } : f)
  useEffect(() => {
    if (result) return
    const t = setTimeout(() => saveDraft(draft, defaults), 300)
    return () => clearTimeout(t)
  }, [draft, defaults, result])

  const target = draft.target
  const mode = target?.mode ?? null
  const targetNote = target?.mode === 'append' ? (index.notes.find(n => n.path === target.path) ?? null) : null
  const appendFields = fieldsFor(kind, 'append')
  const quick = (mode === 'new' ? creatingKind(kind).quick : mode === 'append' ? appendFields : []).map(withVaultOptions)
  const more = (mode === 'new' ? creatingKind(kind).more : []).map(withVaultOptions)
  const changed =
    mode === 'append'
      ? Object.fromEntries(
          Object.entries(draft.values).filter(([k, v]) => {
            const f = appendFields.find(x => x.key === k)
            return f !== undefined && v !== baseline(targetNote, f)
          })
        )
      : draft.values

  const set = (patch: Partial<LogDraft>) => setDraft(d => ({ ...d, ...patch }))
  const setValue = (key: string, value: string) => setDraft(d => ({ ...d, values: { ...d.values, [key]: value } }))

  function chooseTarget(next: LogTarget | null) {
    setExistsPath(null)
    if (!next) return set({ target: null, values: {} })
    if (next.mode === 'new') return set({ target: next, values: { ...creatingKind(kind).defaults } })
    const note = index.notes.find(n => n.path === next.path)
    set({ target: next, values: Object.fromEntries(appendFields.map(f => [f.key, baseline(note, f)])) })
  }

  const ready =
    mode === 'new'
      ? kind.id === 'expense'
        ? Boolean(draft.values.amount?.trim())
        : Boolean(target?.title.trim())
      : mode === 'append'
        ? Boolean(draft.text.trim() || Object.keys(changed).length)
        : false
  const canSubmit = ready && !saving

  function requestBody(): LogRequestBody | null {
    if (!target) return null
    const common = { kind: kind.id, values: changed, text: draft.text, date: draft.date, how: draft.how }
    return target.mode === 'new' ? { mode: 'new', title: target.title, ...common } : { mode: 'append', path: target.path, ...common }
  }

  async function submit() {
    const body = requestBody()
    if (!ready || !body || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setExistsPath(null)
    try {
      const response = await api<LogResponse>('/api/log', { method: 'POST', body })
      clearDraft()
      setResult({ response, title: target?.title || kind.label })
    } catch (err) {
      const data = err instanceof HttpError ? (err.body as { error?: string; path?: string } | null) : null
      if (data?.error === 'exists' && data.path && index.notes.some(n => n.path === data.path)) setExistsPath(data.path)
      toast(err instanceof Error ? err.message : "Couldn't log it.", 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function copy() {
    if (!target) return
    const out =
      target.mode === 'new'
        ? buildNewNote({ kind, title: target.title, values: draft.values, text: draft.text, date: draft.date, how: draft.how }).content
        : formatEntry({ date: draft.date, text: draft.text, how: draft.how, changes: draft.text.trim() ? undefined : changed })
    try {
      await navigator.clipboard.writeText(out)
      toast('Copied', 'success')
    } catch {
      toast("Couldn't copy.", 'error')
    }
  }

  if (result) {
    return (
      <LogDone
        kind={kind}
        title={result.title}
        response={result.response}
        index={index}
        onAgain={() => {
          setResult(null)
          setDraft(freshDraft(kind))
          setShowRestored(false)
        }}
      />
    )
  }

  const write = capabilities?.write ?? false
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-2 md:h-12 md:px-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(logPath(), { replace: true })}>
          <IconChevronLeft stroke={1.75} />
          Log
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-base font-medium md:text-sm">{kind.label}</h1>
        {write ? (
          <Button size="sm" className="max-md:h-9 max-md:px-4" disabled={!canSubmit} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Log it'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={!target} onClick={() => void copy()}>
            <IconCopy stroke={1.75} />
            Copy
          </Button>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
        <form
          className="mx-auto grid max-w-xl gap-5 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          onSubmit={e => {
            e.preventDefault()
            void submit()
          }}
        >
          {showRestored && (
            <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm">
              <span className="flex-1">Draft restored</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearDraft()
                  setDraft(freshDraft(kind))
                  setShowRestored(false)
                }}
              >
                Discard
              </Button>
            </div>
          )}

          {kind.section ? (
            <Section label={kind.type === 'person' ? 'Who?' : 'Which one?'}>
              <TargetPicker kind={kind} notes={index.notes} target={target} onChange={chooseTarget} />
            </Section>
          ) : (
            <Section label="What for?">
              <Input
                aria-label="What for?"
                className="h-11 md:h-8"
                placeholder="Optional, e.g. Groceries"
                value={target?.title ?? ''}
                onChange={e => set({ target: { mode: 'new', title: e.target.value } })}
              />
            </Section>
          )}

          {existsPath && (
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="flex-1">A note with that name already exists.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const note = index.notes.find(n => n.path === existsPath)
                  if (note) chooseTarget({ mode: 'append', path: note.path, title: note.title })
                }}
              >
                Append to it instead
              </Button>
            </div>
          )}

          {mode && kind.howOptions && (
            <Section label="How">
              <Chips label="How" options={kind.howOptions} value={draft.how ?? ''} onChange={v => set({ how: v || null })} />
            </Section>
          )}
          {mode &&
            quick.map(f => (
              <Section key={f.key} label={f.label}>
                <FieldInput field={f} value={draft.values[f.key] ?? ''} onChange={v => setValue(f.key, v)} suggestions={suggestionsFor(f)} />
              </Section>
            ))}
          {mode && (
            <Section label="When">
              <WhenInput value={draft.date} onChange={date => set({ date })} />
            </Section>
          )}
          {mode && (
            <Textarea aria-label="Text" className="min-h-40 md:text-base" placeholder={kind.placeholder} value={draft.text} onChange={e => set({ text: e.target.value })} />
          )}
          {mode && more.length > 0 && (
            <details className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer py-1 text-sm font-medium text-muted-foreground">More details</summary>
              <div className="mt-3 grid gap-4">
                {more.map(f => (
                  <Section key={f.key} label={f.label}>
                    <FieldInput field={f} value={draft.values[f.key] ?? ''} onChange={v => setValue(f.key, v)} />
                  </Section>
                ))}
              </div>
            </details>
          )}
          {mode &&
            (write ? (
              <Button type="submit" size="lg" className="w-full max-md:h-12" disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Log it'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Saving to the vault isn't set up, so Log copies the Markdown instead. See docs/setup.md.</p>
            ))}
        </form>
      </main>
    </div>
  )
}
