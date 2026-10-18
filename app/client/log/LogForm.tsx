// app/client/log/LogForm.tsx
// /log/<kind>: a new note, the cursor already in it. A name, a few chips, the text, Log it. The
// draft is saved as you type and cleared only by a 201. "Log it" sits in the header so the iOS
// keyboard never hides it, and again at the end of the form.
import { IconChevronLeft, IconCopy } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { facetSuggestions } from '../../lib/collections'
import { buildNewNote, creatingKind, localDay, relationshipOptions, titleOptional, type LogField, type LogKind, type LogRequestBody, type LogResponse } from '../../lib/log'
import type { VaultIndex } from '../../lib/types'
import { api } from '../lib/http'
import { useCapabilities } from '../lib/queries'
import { logPath, navigate } from '../lib/router'
import { toast } from '../lib/toast'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { clearDraft, loadDraft, saveDraft, type LogDraft } from './draft'
import { FieldInput, WhenInput } from './FieldInput'
import { LogDone } from './LogDone'

function freshDraft(kind: LogKind): LogDraft {
  return { kind: kind.id, title: '', values: { ...creatingKind(kind).defaults }, text: '', date: localDay() }
}

const NAME_LABEL: Record<string, string> = { person: 'Name', expense: 'What for?' }
const NAME_PLACEHOLDER: Record<string, string> = { note: 'Optional, the first line if empty', expense: 'Optional, e.g. Groceries', person: 'Their name' }

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
  const [result, setResult] = useState<{ response: LogResponse; title: string } | null>(null)
  // A ref, not just state: two quick taps must never send two logs.
  const savingRef = useRef(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const creates = creatingKind(kind)
  const defaults = creates.defaults
  const suggestions = useMemo(
    () => ({ collection: facetSuggestions(index.notes, creates.type, 'collection'), category: facetSuggestions(index.notes, creates.type, 'category') }),
    [creates, index.notes]
  )
  const suggestionsFor = (f: LogField) => (f.kind === 'list' ? suggestions[f.key === 'collection' ? 'collection' : 'category'] : undefined)
  // Relationship offers the generic choices plus the ones this vault's people already have.
  const relationships = useMemo(() => relationshipOptions(index.notes), [index.notes])
  const withVaultOptions = (f: LogField): LogField => (f.key === 'relationship' && f.kind === 'select' ? { ...f, options: relationships } : f)
  useEffect(() => {
    if (result) return
    const t = setTimeout(() => saveDraft(draft, defaults), 300)
    return () => clearTimeout(t)
  }, [draft, defaults, result])

  const quick = creates.quick.map(withVaultOptions)
  const more = creates.more.map(withVaultOptions)
  // A Note is mostly its text: the cursor goes there, and the text comes before the chips.
  const textFirst = kind.id === 'note'

  const set = (patch: Partial<LogDraft>) => setDraft(d => ({ ...d, ...patch }))
  const setValue = (key: string, value: string) => setDraft(d => ({ ...d, values: { ...d.values, [key]: value } }))

  const ready =
    kind.id === 'expense'
      ? Boolean(draft.values.amount?.trim())
      : titleOptional(kind)
        ? Boolean(draft.title.trim() || draft.text.trim())
        : Boolean(draft.title.trim())
  const canSubmit = ready && !saving

  async function submit() {
    if (!ready || savingRef.current) return
    const body: LogRequestBody = { mode: 'new', kind: kind.id, title: draft.title, values: draft.values, text: draft.text, date: draft.date, how: null }
    savingRef.current = true
    setSaving(true)
    try {
      const response = await api<LogResponse>('/api/log', { method: 'POST', body })
      clearDraft()
      // The file's name is the title it got ("Dune 2" when Dune was taken), less an expense's date.
      const name = (response.path.split('/').pop() ?? '').replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2} /, '')
      setResult({ response, title: name || kind.label })
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't log it.", 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function copy() {
    const out = buildNewNote({ kind, title: draft.title, values: draft.values, text: draft.text, date: draft.date }).content
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
  const text = (
    <Textarea ref={textRef} aria-label="Text" autoFocus={textFirst} className="min-h-40 md:text-base" placeholder={kind.placeholder} value={draft.text} onChange={e => set({ text: e.target.value })} />
  )
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
          <Button size="sm" variant="outline" disabled={!ready} onClick={() => void copy()}>
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
                  ;(textFirst ? textRef : titleRef).current?.focus()
                }}
              >
                Discard
              </Button>
            </div>
          )}

          <Section label={NAME_LABEL[kind.id] ?? 'Title'}>
            <Input
              ref={titleRef}
              aria-label={NAME_LABEL[kind.id] ?? 'Title'}
              autoFocus={!textFirst}
              enterKeyHint="next"
              className="h-11 md:h-8"
              placeholder={NAME_PLACEHOLDER[kind.id]}
              value={draft.title}
              onChange={e => set({ title: e.target.value })}
              onKeyDown={e => {
                // Return goes on to the text instead of logging a note that has only a name.
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                e.preventDefault()
                textRef.current?.focus()
              }}
            />
          </Section>
          {textFirst && text}
          {quick.map(f => (
            <Section key={f.key} label={f.label}>
              <FieldInput field={f} value={draft.values[f.key] ?? ''} onChange={v => setValue(f.key, v)} suggestions={suggestionsFor(f)} />
            </Section>
          ))}
          <Section label="When">
            <WhenInput value={draft.date} onChange={date => set({ date })} />
          </Section>
          {!textFirst && text}
          {more.length > 0 && (
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
          {write ? (
              <Button type="submit" size="lg" className="w-full max-md:h-12" disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Log it'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Saving to the vault isn't set up, so Log copies the Markdown instead. See docs/setup.md.</p>
            )}
        </form>
      </main>
    </div>
  )
}
