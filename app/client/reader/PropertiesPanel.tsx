// app/client/reader/PropertiesPanel.tsx
// Frontmatter as a collapsible key/value panel (spec §9): dates, links and
// [[wikilinks]] formatted; hidden when empty. When soii can write, "Edit" turns every
// property (also empty ones and those a header shows) into an editor (D62).
import { IconChevronRight, IconPencil } from '@tabler/icons-react'
import { Fragment, useState } from 'react'
import { formatDate } from '../../lib/format'
import { notePath } from '../../lib/paths'
import { PROTECTED_PROPERTIES, suggestKeys } from '../../lib/properties'
import type { NoteMeta } from '../../lib/types'
import { useCapabilities, useVault } from '../lib/queries'
import { navigate } from '../lib/router'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '../ui/utils'
import { labelFor } from '../views/cells'
import { AddProperty, CadenceField, PropertyField } from './PropertyEditor'

function findNote(notes: NoteMeta[], name: string): NoteMeta | undefined {
  const key = name.trim().toLowerCase().replace(/\.md$/, '')
  return notes
    .filter(n => n.id.toLowerCase() === key || n.id.toLowerCase().endsWith(`/${key}`))
    .sort((a, b) => a.id.length - b.id.length)[0]
}

function NoteLink({ name, label }: { name: string; label?: string }) {
  const vault = useVault()
  const target = findNote(vault.data?.notes ?? [], name)
  if (!target) return <span className="text-muted-foreground">{label ?? name}</span>
  return (
    <a
      href={notePath(target.id)}
      onClick={e => {
        e.preventDefault()
        navigate(notePath(target.id))
      }}
      className="underline underline-offset-2"
    >
      {label ?? target.title}
    </a>
  )
}

const WIKI = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/

function PropertyValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    // Unquoted `related: [[Erica]]` arrives from YAML as [["Erica"]].
    if (value.length === 1 && typeof value[0] === 'string') return <NoteLink name={value[0]} />
    return (
      // Each item gets its own element: bare text runs in a flex container merge into one item.
      <span className="flex flex-wrap gap-x-1">
        {value.map((v, i) => (
          <span key={i}>
            <PropertyValue value={v} />
            {i < value.length - 1 && ','}
          </span>
        ))}
      </span>
    )
  }
  if (typeof value === 'string') {
    const text = value.trim()
    if (/^https?:\/\//.test(text)) {
      return (
        <a href={text} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          {text}
        </a>
      )
    }
    const wiki = WIKI.exec(text)
    if (wiki) return <NoteLink name={wiki[1]} label={wiki[2]} />
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return <>{formatDate(text, 'short')}</>
    return <>{text}</>
  }
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>
  if (value && typeof value === 'object') return <code className="font-mono text-xs">{JSON.stringify(value)}</code>
  return <>{String(value)}</>
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <>
      <dt className="text-muted-foreground">Tags</dt>
      <dd className="flex flex-wrap gap-1">
        {tags.map(t => (
          <Badge key={t} variant="secondary">
            {t}
          </Badge>
        ))}
      </dd>
    </>
  )
}

function EditRows({ note }: { note: NoteMeta }) {
  const vault = useVault()
  // A person's cadence has its own picker, whether or not the note sets one yet.
  const person = note.type === 'person'
  const entries = Object.entries(note.frontmatter).filter(([key]) => !PROTECTED_PROPERTIES.has(key.toLowerCase()) && !(person && key === 'cadence'))
  return (
    <>
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="truncate pt-1 text-muted-foreground">{labelFor(key)}</dt>
          <dd className="min-w-0 wrap-anywhere">
            <PropertyField key={JSON.stringify(value ?? null)} note={note} name={key} value={value}>
              <PropertyValue value={value} />
            </PropertyField>
          </dd>
        </Fragment>
      ))}
      {person && (
        <>
          <dt className="truncate pt-1 text-muted-foreground">Reach out</dt>
          <dd className="min-w-0">
            <CadenceField note={note} />
          </dd>
        </>
      )}
      <Tags tags={note.tags} />
      <AddProperty note={note} suggestions={suggestKeys(note, vault.data?.notes ?? [])} />
    </>
  )
}

export function PropertiesPanel({ note, hide = [] }: { note: NoteMeta; hide?: string[] }) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const canEdit = useCapabilities().data?.write === true
  const entries = Object.entries(note.frontmatter).filter(
    ([key, v]) => !PROTECTED_PROPERTIES.has(key) && !hide.includes(key) && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  )
  if (entries.length === 0 && note.tags.length === 0 && !canEdit) return null
  return (
    <section className="my-4 rounded-lg bg-muted px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <IconChevronRight size={12} stroke={1.75} className={cn('transition-transform', open && 'rotate-90')} />
          Properties
        </button>
        {canEdit && (
          <Button
            size="xs"
            variant="ghost"
            className="-my-1 -mr-2 text-muted-foreground"
            aria-pressed={editing}
            onClick={() => {
              setEditing(e => !e)
              setOpen(true)
            }}
          >
            {editing ? (
              'Done'
            ) : (
              <>
                <IconPencil />
                Edit
              </>
            )}
          </Button>
        )}
      </div>
      {open && (editing || entries.length > 0 || note.tags.length > 0) && (
        <dl className="mt-2 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1.5">
          {editing ? (
            <EditRows note={note} />
          ) : (
            <>
              {entries.map(([key, value]) => (
                <Fragment key={key}>
                  <dt className="truncate text-muted-foreground">{labelFor(key)}</dt>
                  <dd className="min-w-0 wrap-anywhere">
                    <PropertyValue value={value} />
                  </dd>
                </Fragment>
              ))}
              <Tags tags={note.tags} />
            </>
          )}
        </dl>
      )}
    </section>
  )
}
