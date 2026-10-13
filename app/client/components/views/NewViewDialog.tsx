// app/client/components/views/NewViewDialog.tsx
// "+": a new view in this workspace (D101). Four preset layouts with one setting each, a filter (which notes
// are in it) and the first sort key (their order), with a live preview of the real view on the owner's notes.
import { IconLayoutGrid, IconLayoutKanban, IconList, IconPlus, IconTable } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { runTab } from '../../../lib/query'
import type { SortKey, TabConfig, VaultIndex, WorkspaceConfig } from '../../../lib/types'
import { vaultFields } from '../../../lib/view-fields'
import { rowsToQuery, type FilterRow } from '../../../lib/view-filter'
import { similarTabs } from '../../../lib/view-overlap'
import { HttpError } from '../../lib/http'
import { navigate, workspacePath } from '../../lib/router'
import { toast } from '../../lib/toast'
import { builtAt } from '../../lib/use-fresh-vault'
import { addView, afterViewWrite } from '../../lib/views-api'
import { Button } from '../../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog'
import { Input } from '../../ui/input'
import { handlesEmpty, views } from '../../views/registry'
import { ListCombobox } from '../ListCombobox'
import { ViewBoundary } from '../ViewBoundary'
import { FilterEditor, SELECT_CLASS } from './FilterEditor'
import { SortEditor } from './SortEditor'

type Layout = 'list' | 'table' | 'gallery' | 'board'
const LAYOUTS: { view: Layout; label: string; hint: string; Icon: typeof IconList }[] = [
  { view: 'list', label: 'List', hint: 'Titles, with a short line under each', Icon: IconList },
  { view: 'table', label: 'Table', hint: 'Rows, with a column per property', Icon: IconTable },
  { view: 'gallery', label: 'Gallery', hint: 'Cards with covers', Icon: IconLayoutGrid },
  { view: 'board', label: 'Board', hint: 'Columns, one per value of a property', Icon: IconLayoutKanban }
]
const DEFAULT_SORT: SortKey[] = [{ field: 'date', dir: 'desc' }]
const split = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium">
        {title}
        {subtitle && <span className="font-normal text-muted-foreground"> · {subtitle}</span>}
      </h3>
      {children}
    </section>
  )
}

export function NewViewButton({ workspace, index }: { workspace: WorkspaceConfig; index: VaultIndex }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" aria-label={`New view in ${workspace.title}`} />}>
        <IconPlus stroke={1.75} />
      </DialogTrigger>
      {open && <NewViewForm workspace={workspace} index={index} onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function NewViewForm({ workspace, index, onDone }: { workspace: WorkspaceConfig; index: VaultIndex; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [layout, setLayout] = useState<Layout>('list')
  const [rows, setRows] = useState<FilterRow[]>([])
  const [sort, setSort] = useState<SortKey[]>(DEFAULT_SORT)
  const [subtitle, setSubtitle] = useState('')
  const [groupBy, setGroupBy] = useState('status')
  const [columns, setColumns] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = useMemo(() => rowsToQuery(rows), [rows])
  const base: TabConfig = { id: '__draft__', title: title.trim() || 'New view', view: layout, query }
  const matched = useMemo(() => runTab(base, index), [query, index]) // eslint-disable-line react-hooks/exhaustive-deps
  const fields = useMemo(() => vaultFields(matched).fields.map(f => f.field), [matched])
  const defaultColumns = ['title', ...fields.filter(f => f !== 'title').slice(0, 3)]
  // No chips left means "the default columns", in the preview and in what's saved (TableView rejects an empty list).
  const pickedColumns = columns === null ? [] : split(columns)
  const tableColumns = pickedColumns.length ? pickedColumns : defaultColumns
  const options: Record<string, unknown> | undefined =
    layout === 'list' ? (subtitle ? { subtitle } : undefined) : layout === 'table' ? { columns: tableColumns } : layout === 'board' ? { groupBy } : undefined
  const draft: TabConfig = { ...base, ...(sort.length ? { sort } : {}), ...(options ? { options } : {}) }
  const notes = useMemo(() => runTab(draft, index), [JSON.stringify(draft), index]) // eslint-disable-line react-hooks/exhaustive-deps
  const similar = useMemo(() => similarTabs(draft, workspace, index)[0], [query, workspace, index]) // eslint-disable-line react-hooks/exhaustive-deps
  const View = views[layout]

  const save = async () => {
    if (!title.trim()) return setError('Give the view a title.')
    setSaving(true)
    setError(null)
    try {
      const before = await builtAt()
      const { id: _draftId, ...tab } = draft
      const result = await addView(workspace.id, { ...tab, title: title.trim() })
      toast(`Added ${result.title} to ${workspace.title}.`)
      if (result.warning) toast(result.warning)
      await afterViewWrite(queryClient, before)
      onDone()
      navigate(workspacePath(workspace.id, result.tabId))
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'Saving failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl max-md:h-dvh max-md:max-h-dvh max-md:max-w-none max-md:rounded-none">
      <DialogHeader>
        <DialogTitle>New view in {workspace.title}</DialogTitle>
        <DialogDescription>Saved as a tab in soii.config.yml, with a local commit.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-6 md:grid-cols-[22rem_1fr]">
        <div className="grid content-start gap-5">
          <Section title="View">
            <Input aria-label="Title" placeholder="Title, e.g. Sci-fi books" value={title} onChange={e => setTitle(e.target.value)} />
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Layout">
              {LAYOUTS.map(({ view, label, hint, Icon }) => (
                <button
                  key={view}
                  type="button"
                  role="radio"
                  aria-checked={layout === view}
                  onClick={() => setLayout(view)}
                  className={`grid gap-0.5 rounded-lg border p-2 text-left text-sm ${layout === view ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <Icon size={16} /> {label}
                  </span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
            {layout === 'list' && (
              <label className="grid gap-1.5 text-sm">
                <span>Line under each title</span>
                <select className={SELECT_CLASS} value={subtitle} onChange={e => setSubtitle(e.target.value)}>
                  <option value="">None</option>
                  {fields.map(f => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {layout === 'table' && (
              <div className="grid gap-1.5">
                <ListCombobox
                  label="Columns"
                  value={columns ?? defaultColumns.join(', ')}
                  onChange={setColumns}
                  suggestions={['title', ...fields].map(f => ({ key: f, value: f, label: f, count: 0 }))}
                />
                {columns !== null && pickedColumns.length === 0 && <span className="text-xs text-muted-foreground">No columns picked: the default columns are used.</span>}
              </div>
            )}
            {layout === 'board' && (
              <label className="grid gap-1.5 text-sm">
                <span>Columns by</span>
                <select className={SELECT_CLASS} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
                  {[...new Set(['status', ...fields])].map(f => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Section>
          <Section title="Filter" subtitle="which notes are in this view">
            <FilterEditor rows={rows} onChange={setRows} notes={index.notes} />
          </Section>
          <Section title="Sort" subtitle="the order they're shown in">
            <SortEditor sort={sort} onChange={setSort} fields={fields} max={1} />
          </Section>
          {similar && (
            <p className="rounded-lg bg-muted p-2 text-sm">
              <button type="button" className="underline" onClick={() => (onDone(), navigate(workspacePath(workspace.id, similar.tabId)))}>
                {similar.title}
              </button>{' '}
              already shows mostly the same notes ({Math.round(similar.overlap * 100)}%).
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save view'}
          </Button>
        </div>
        <div className="grid min-h-64 content-start gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Preview: {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </p>
          <div className="max-h-[70dvh] overflow-auto rounded-lg border">
            {notes.length === 0 && !handlesEmpty.has(layout) ? (
              <p className="p-6 text-sm text-muted-foreground">No notes match yet. You can still save it.</p>
            ) : (
              <ViewBoundary key={layout} view={layout}>
                <View workspace={workspace} tab={draft} notes={notes} index={index} openNote={() => {}} />
              </ViewBoundary>
            )}
          </div>
        </div>
      </div>
    </DialogContent>
  )
}
