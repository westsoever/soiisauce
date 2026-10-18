// app/client/components/AddNoteDialog.tsx
// "Add book", "Add movie"…: fill in the fields, get the note with its frontmatter written.
// With writing set up (VAULT_PATH) it saves to the vault;
// Copy and Download always work.
import { IconCloudUpload, IconCopy, IconDownload, IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { facetSuggestions, LIST_FIELDS } from '../../lib/collections'
import { buildNote, type NewNoteSpec } from '../../lib/new-note'
import type { NoteMeta } from '../../lib/types'
import { api } from '../lib/http'
import { useCapabilities } from '../lib/queries'
import { toast } from '../lib/toast'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog'
import { Input } from '../ui/input'
import { parseBrowse } from '../views/gallery/browse'
import { localAddedMessage } from './added-message'
import { ListCombobox } from './ListCombobox'

const SELECT_CLASS =
  'h-8 w-full rounded-lg border bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'

export function AddNoteButton({ spec, notes }: { spec: NewNoteSpec; notes: NoteMeta[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="shrink-0" />}>
        <IconPlus stroke={1.75} />
        <span>Add {spec.noun}</span>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        {/* Remounted per open so the form starts from the defaults each time. */}
        {open && <AddNoteForm spec={spec} notes={notes} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AddNoteForm({ spec, notes, onDone }: { spec: NewNoteSpec; notes: NoteMeta[]; onDone: () => void }) {
  const capabilities = useCapabilities().data
  const [saving, setSaving] = useState(false)
  // Opened from a Library view filtered to a collection or category: start with that one filled in.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const here = parseBrowse(location.search)
    const raw = (field: 'collection' | 'category', key: string | null) =>
      key ? facetSuggestions(notes, spec.type, field).find(f => f.key === key)?.value : undefined
    const collection = raw('collection', here.c)
    const category = raw('category', here.cat)
    return { ...spec.defaults, ...(collection ? { collection } : {}), ...(category ? { category } : {}) }
  })
  const note = useMemo(() => buildNote(spec, values), [spec, values])
  const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }))
  const lists = LIST_FIELDS.filter(f => spec.extra?.some(p => p.key === f.key))
  const suggestions = useMemo(
    () => ({ collection: facetSuggestions(notes, spec.type, 'collection'), category: facetSuggestions(notes, spec.type, 'category') }),
    [notes, spec.type]
  )

  async function save() {
    setSaving(true)
    try {
      const saved = await api<{ path: string; warning?: string | null }>('/api/notes', { method: 'POST', body: { type: spec.type, values } })
      toast(localAddedMessage(saved.path, saved.warning, Boolean(capabilities?.remote)), 'success')
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save the note.", 'error')
      setSaving(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(note.content)
      toast('Copied the note', 'success')
    } catch {
      toast("Couldn't copy. Select the text below instead.", 'error')
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([note.content], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url
    a.download = note.path.split('/').pop() ?? 'note.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add {spec.noun}</DialogTitle>
        <DialogDescription>
          Fill in what you know. The frontmatter is written for you; every field but the title is optional.
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={e => e.preventDefault()}>
        {spec.fields.map((field, i) => (
          <label key={field.key} className="grid gap-1 text-xs font-medium text-muted-foreground">
            {field.label}
            {field.kind === 'select' ? (
              <select className={SELECT_CLASS} value={values[field.key] ?? ''} onChange={e => set(field.key, e.target.value)}>
                <option value="">—</option>
                {field.options?.map(o => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                autoFocus={i === 0}
                type={field.kind === 'date' ? 'date' : 'text'}
                inputMode={field.kind === 'number' ? 'decimal' : undefined}
                placeholder={field.placeholder}
                value={values[field.key] ?? ''}
                onChange={e => set(field.key, e.target.value)}
              />
            )}
          </label>
        ))}
        {lists.map(f => (
          <div key={f.key} className="grid gap-1 text-xs font-medium text-muted-foreground">
            {f.label}
            <ListCombobox label={f.label} value={values[f.key] ?? ''} onChange={v => set(f.key, v)} suggestions={suggestions[f.key]} />
          </div>
        ))}
      </form>
      <div className="grid gap-1.5">
        <div className="truncate text-xs text-muted-foreground" title={note.path}>
          {note.path}
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg bg-accent p-3 text-xs whitespace-pre-wrap">{note.content}</pre>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={download}>
          <IconDownload stroke={1.75} />
          Download
        </Button>
        <Button variant={capabilities?.write ? 'outline' : 'default'} onClick={copy}>
          <IconCopy stroke={1.75} />
          Copy note
        </Button>
        {capabilities?.write && (
          <Button disabled={saving || !values.title?.trim()} onClick={() => void save()}>
            <IconCloudUpload stroke={1.75} />
            {saving ? 'Saving…' : 'Add to vault'}
          </Button>
        )}
      </div>
    </>
  )
}
