// app/client/reader/PropertyEditor.tsx
// Editing frontmatter from the reader (D62): one editor per property, an "Add property" row,
// and the save that sends one property to POST /api/notes/properties (one commit per save).
import { useQueryClient } from '@tanstack/react-query'
import { IconPlus, IconX } from '@tabler/icons-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { localDay } from '../../lib/log'
import { CADENCE_CHOICES, cadenceChoice, cadenceChoiceLabel, cadenceDefaults, cadenceLabel, cadenceToStamp, relationshipCadence } from '../../lib/people'
import {
  cleanPropertyValue,
  draftFor,
  isEditableKey,
  valueFromDraft,
  type PropertyDraft,
  type PropertyEditor as EditorKind,
  type PropertyValue
} from '../../lib/properties'
import type { NoteDoc, NoteMeta, VaultIndex } from '../../lib/types'
import { api } from '../lib/http'
import { keys, useVault } from '../lib/queries'
import { toast } from '../lib/toast'
import { builtAt, waitForRebuild } from '../lib/use-fresh-vault'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { Switch } from '../ui/switch'
import { labelFor } from '../views/cells'

interface SavedProperty {
  path: string
  warning: string | null
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Save one property; resolves true when it was written. Shows the new value at once, then catches up with the rebuild. */
export function useSaveProperty(note: NoteMeta) {
  const queryClient = useQueryClient()
  const index = useVault().data
  const saveOne = async (key: string, value: PropertyValue): Promise<boolean> => {
    try {
      const before = await builtAt()
      const saved = await api<SavedProperty>('/api/notes/properties', { method: 'POST', body: { path: note.path, key, value, date: localDay() } })
      const patch = <T extends NoteMeta>(n: T): T => (n.path === note.path ? { ...n, frontmatter: { ...n.frontmatter, [key]: value } } : n)
      queryClient.setQueryData<VaultIndex>(keys.vault, index => index && { ...index, notes: index.notes.map(patch) })
      queryClient.setQueryData<NoteDoc>(keys.note(note.id), doc => doc && patch(doc))
      const label = labelFor(key)
      const extra = saved.warning && !saved.warning.startsWith('Committed') ? ` ${saved.warning}` : ''
      toast(`Saved ${label}.${extra}`, extra ? 'info' : 'success')
      void waitForRebuild(queryClient, before)
      return true
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that property.", 'error')
      return false
    }
  }
  return async (key: string, value: PropertyValue): Promise<boolean> => {
    const ok = await saveOne(key, value)
    // A person whose relationship is set here gets that relationship's cadence written into the note, once.
    // From then on the note's own `cadence` rules; changing the relationship later doesn't touch it.
    if (ok && key === 'relationship' && note.type === 'person' && index) {
      const stamp = cadenceToStamp(note, value, cadenceDefaults(index.config))
      if (stamp) await saveOne('cadence', stamp)
    }
    return ok
  }
}

function ListEditor({ draft, setDraft, onEnter, disabled, label }: { draft: PropertyDraft; setDraft: (d: PropertyDraft) => void; onEnter: () => void; disabled: boolean; label: string }) {
  const addTyped = () => {
    const text = draft.text.trim()
    if (text) setDraft({ ...draft, items: [...draft.items, text], text: '' })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ',' || (e.key === 'Enter' && draft.text.trim())) {
      e.preventDefault()
      addTyped()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onEnter()
    } else if (e.key === 'Backspace' && !draft.text && draft.items.length) {
      setDraft({ ...draft, items: draft.items.slice(0, -1) })
    }
  }
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {draft.items.map((item, i) => (
        <span key={`${i}-${item}`} className="inline-flex items-center gap-0.5 rounded-md bg-background py-0.5 pr-0.5 pl-1.5 text-xs">
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            disabled={disabled}
            onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
            className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          >
            <IconX size={12} stroke={2} />
          </button>
        </span>
      ))}
      <input
        aria-label={`Add to ${label}`}
        value={draft.text}
        disabled={disabled}
        placeholder={draft.items.length ? '' : 'Type, then Enter'}
        onChange={e => setDraft({ ...draft, text: e.target.value })}
        onKeyDown={onKeyDown}
        onBlur={addTyped}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  )
}

/** The input for a draft. Enter saves, Escape puts the old value back. */
export function DraftInput({
  draft,
  setDraft,
  onEnter,
  onEscape,
  disabled,
  label
}: {
  draft: PropertyDraft
  setDraft: (d: PropertyDraft) => void
  onEnter: () => void
  onEscape: () => void
  disabled: boolean
  label: string
}) {
  if (draft.editor === 'boolean') {
    return <Switch aria-label={label} checked={draft.checked} disabled={disabled} onCheckedChange={checked => setDraft({ ...draft, checked })} />
  }
  if (draft.editor === 'list') return <ListEditor draft={draft} setDraft={setDraft} onEnter={onEnter} disabled={disabled} label={label} />
  return (
    <Input
      aria-label={label}
      type={draft.editor === 'date' ? 'date' : 'text'}
      inputMode={draft.editor === 'number' ? 'decimal' : undefined}
      value={draft.text}
      disabled={disabled}
      onChange={e => setDraft({ ...draft, text: e.target.value })}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter()
        } else if (e.key === 'Escape') onEscape()
      }}
      className="h-7"
    />
  )
}

function SaveButtons({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button size="xs" onClick={onSave} disabled={saving}>
        {saving && <Spinner />}
        Save
      </Button>
      <Button size="xs" variant="ghost" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
    </div>
  )
}

/** One property in edit mode. Parents key it by value, so a saved or refetched value resets the draft. */
export function PropertyField({ note, name, value, children }: { note: NoteMeta; name: string; value: unknown; children: React.ReactNode }) {
  const save = useSaveProperty(note)
  const initial = isEditableKey(name) ? draftFor(value, null, name) : null
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  if (!initial || !draft) {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2">
        {children}
        <span className="text-xs text-muted-foreground">Edit in Obsidian</span>
      </span>
    )
  }
  const current = cleanPropertyValue(value)
  const next = valueFromDraft(draft)
  const dirty = !next.ok || !current.ok || !same(next.value, current.value)

  async function commit(d: PropertyDraft) {
    const v = valueFromDraft(d)
    if (!v.ok) return toast(v.message, 'error')
    setSaving(true)
    const ok = await save(name, v.value)
    setSaving(false)
    if (!ok && initial) setDraft(initial)
  }

  const label = labelFor(name)
  if (draft.editor === 'boolean') {
    // A switch saves as you flip it.
    return (
      <span className="flex items-center gap-2">
        <DraftInput
          draft={draft}
          disabled={saving}
          label={label}
          onEnter={() => {}}
          onEscape={() => {}}
          setDraft={d => {
            setDraft(d)
            void commit(d)
          }}
        />
        {saving && <Spinner />}
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="min-w-40 flex-1">
        <DraftInput draft={draft} setDraft={setDraft} disabled={saving} label={label} onEnter={() => dirty && void commit(draft)} onEscape={() => setDraft(initial)} />
      </div>
      {dirty && <SaveButtons saving={saving} onSave={() => void commit(draft)} onCancel={() => setDraft(initial)} />}
    </div>
  )
}

const KINDS: { id: EditorKind; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'list', label: 'List' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'boolean', label: 'Yes/No' }
]

const SELECT_CLASS =
  'h-7 rounded-lg border bg-transparent px-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'

/** A person's cadence: how often soii suggests reaching out. Saves on change; "Default" clears it, so the relationship's default applies again. */
export function CadenceField({ note }: { note: NoteMeta }) {
  const save = useSaveProperty(note)
  const index = useVault().data
  const [saving, setSaving] = useState(false)
  const inherited = index ? relationshipCadence(note, cadenceDefaults(index.config)) : null
  const choice = cadenceChoice(note.frontmatter.cadence)
  const choices = choice === '' || CADENCE_CHOICES.includes(choice) ? CADENCE_CHOICES : [...CADENCE_CHOICES, choice]
  return (
    <span className="flex items-center gap-2">
      <select
        aria-label="Reach out"
        value={choice}
        disabled={saving}
        onChange={async e => {
          setSaving(true)
          await save('cadence', e.target.value || null)
          setSaving(false)
        }}
        className={SELECT_CLASS}
      >
        <option value="">{inherited ? `Default (${cadenceLabel(inherited)})` : 'Default (no reminders)'}</option>
        {choices.map(c => (
          <option key={c} value={c}>
            {cadenceChoiceLabel(c)}
          </option>
        ))}
      </select>
      {saving && <Spinner />}
    </span>
  )
}

/** "Add property": a name (suggested from notes of the same type), a kind, and a value. */
export function AddProperty({ note, suggestions }: { note: NoteMeta; suggestions: string[] }) {
  const save = useSaveProperty(note)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<PropertyDraft>(() => draftFor(null, 'text') as PropertyDraft)
  const [saving, setSaving] = useState(false)
  const reset = () => {
    setOpen(false)
    setName('')
    setDraft(draftFor(null, 'text') as PropertyDraft)
  }

  if (!open) {
    return (
      <Button size="xs" variant="ghost" className="col-span-2 -ml-2 justify-self-start text-muted-foreground" onClick={() => setOpen(true)}>
        <IconPlus />
        Add property
      </Button>
    )
  }

  async function add() {
    const key = name.trim()
    if (!isEditableKey(key)) return toast(key ? `soii can't use "${key}" as a property name.` : 'Name the property first.', 'error')
    if (Object.hasOwn(note.frontmatter, key)) return toast(`${labelFor(key)} is already there. Change it above.`, 'error')
    const v = valueFromDraft(draft)
    if (!v.ok) return toast(v.message, 'error')
    setSaving(true)
    const ok = await save(key, v.value)
    setSaving(false)
    if (ok) reset()
  }

  return (
    <div className="col-span-2 mt-1 flex flex-col gap-1.5 border-t border-border/60 pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          aria-label="Property name"
          placeholder="Property name"
          list={listId}
          value={name}
          disabled={saving}
          autoFocus
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && reset()}
          className="h-7 w-40"
        />
        <datalist id={listId}>
          {suggestions.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <select
          aria-label="Kind"
          value={draft.editor}
          disabled={saving}
          onChange={e => setDraft(draftFor(null, e.target.value as EditorKind) as PropertyDraft)}
          className={SELECT_CLASS}
        >
          {KINDS.map(k => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="min-w-40 flex-1">
          <DraftInput draft={draft} setDraft={setDraft} disabled={saving} label="Value" onEnter={() => void add()} onEscape={reset} />
        </div>
        <SaveButtons saving={saving} onSave={() => void add()} onCancel={reset} />
      </div>
    </div>
  )
}
