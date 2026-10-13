// app/client/components/views/ViewSettingsPanel.tsx
// "⋯" on a tab (D101): Filter (which notes are in this view), Sort (the order they're shown in), Remove view.
// Edits apply live to the view behind the panel (WorkspaceScreen applies `pending`); Done saves both in one
// commit, Cancel drops them. A filter the rows can't show faithfully (OR groups, path globs) is read-only.
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { DEFAULT_CONFIG } from '../../../lib/default-config'
import { runTab } from '../../../lib/query'
import type { Query, SortKey, TabConfig, VaultIndex, WorkspaceConfig } from '../../../lib/types'
import { vaultFields } from '../../../lib/view-fields'
import { applyPending, describeFilter, queryToRows, rowsToQuery, type FilterRow } from '../../../lib/view-filter'
import { HttpError } from '../../lib/http'
import { navigate, workspacePath } from '../../lib/router'
import { toast } from '../../lib/toast'
import { builtAt } from '../../lib/use-fresh-vault'
import { afterViewWrite, removeView, updateView } from '../../lib/views-api'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../../ui/alert-dialog'
import { Button } from '../../ui/button'
import { FilterEditor } from './FilterEditor'
import { SortEditor } from './SortEditor'

export type PendingView = { query?: Query; sort?: SortKey[] }
const count = (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
// `pending` is spread over the tab, so a key set back to the saved value must be left out, not set to undefined.
const without = (p: PendingView, key: keyof PendingView): PendingView => {
  const { [key]: _dropped, ...rest } = p
  return rest
}

export function ViewSettingsPanel({
  workspace,
  tab,
  index,
  pending,
  onPending,
  onClose,
  isStale
}: {
  workspace: WorkspaceConfig
  tab: TabConfig
  index: VaultIndex
  pending: PendingView
  onPending: (p: PendingView) => void
  onClose: () => void
  /** True once the tab this panel was opened on is no longer the one on screen (a save can outlive a tab switch). */
  isStale: () => boolean
}) {
  const queryClient = useQueryClient()
  const initialRows = useMemo(() => queryToRows(tab.query), [tab.query])
  const [rows, setRows] = useState<FilterRow[] | null>(initialRows)
  const [saving, setSaving] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sort = pending.sort ?? tab.sort ?? []
  const was = useMemo(() => runTab(tab, index).length, [tab, index])
  const now = useMemo(() => runTab(applyPending(tab, pending), index).length, [tab, pending, index])
  const fields = useMemo(() => vaultFields(runTab(tab, index)).fields.map(f => f.field), [tab, index])
  const builtIn = DEFAULT_CONFIG.workspaces.find(w => w.id === workspace.id)
  const untouchedBuiltIn = builtIn !== undefined && same(builtIn, workspace)

  const changeRows = (next: FilterRow[]) => {
    setRows(next)
    const query = rowsToQuery(next)
    // "Unchanged" means the same as the saved filter *as rows would write it*, so touching and reverting a row
    // never rewrites a hand-written query.
    onPending(same(query, rowsToQuery(initialRows ?? [])) ? without(pending, 'query') : { ...pending, query })
  }
  const changeSort = (next: SortKey[]) => onPending(same(next, tab.sort ?? []) ? without(pending, 'sort') : { ...pending, sort: next })

  const done = async () => {
    const change = { ...(pending.query !== undefined ? { query: pending.query } : {}), ...(pending.sort !== undefined ? { sort: pending.sort } : {}) }
    if (!Object.keys(change).length) return onClose()
    setSaving(true)
    setError(null)
    try {
      const before = await builtAt()
      const result = await updateView(workspace.id, tab.id, change)
      toast(`Saved ${tab.title}.`)
      if (result.warning) toast(result.warning)
      await afterViewWrite(queryClient, before)
      onPending({})
      onClose()
    } catch (err) {
      const message = err instanceof HttpError ? err.message : 'Saving failed. Try again.'
      if (isStale()) toast(`Couldn't save ${tab.title}: ${message}`, 'error')
      else setError(message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setConfirmingRemove(false)
    setSaving(true)
    try {
      const before = await builtAt()
      const result = await removeView(workspace.id, tab.id)
      toast(`Removed ${tab.title}.`)
      if (result.warning) toast(result.warning)
      onPending({})
      onClose()
      // Only follow the removed tab out if we're still on it.
      if (!isStale()) navigate(workspacePath(workspace.id, workspace.tabs.find(t => t.id !== tab.id)!.id))
      await afterViewWrite(queryClient, before)
    } catch (err) {
      const message = err instanceof HttpError ? err.message : 'Removing failed. Try again.'
      if (isStale()) toast(`Couldn't remove ${tab.title}: ${message}`, 'error')
      else setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside
      aria-label={`${tab.title} settings`}
      className="grid content-start gap-5 overflow-y-auto border-l bg-background p-4 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:max-h-[80dvh] max-md:rounded-t-xl max-md:border-t max-md:border-l-0 md:w-96"
    >
      <h2 className="text-base font-medium">{tab.title}</h2>
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">
          Filter <span className="font-normal text-muted-foreground">· which notes are in this view</span>
        </h3>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {now === was ? count(now) : `${count(now)}, was ${was}`}
        </p>
        {rows ? (
          <FilterEditor rows={rows} onChange={changeRows} notes={index.notes} />
        ) : (
          <div className="grid gap-1 rounded-lg bg-muted p-2 text-sm">
            {describeFilter(tab.query).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <p className="text-xs text-muted-foreground">This filter has more than the panel can edit. Change it with /soii-view or in soii.config.yml.</p>
          </div>
        )}
      </section>
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">
          Sort <span className="font-normal text-muted-foreground">· the order they're shown in</span>
        </h3>
        <SortEditor sort={sort} onChange={changeSort} fields={fields} />
      </section>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 z-10 -mx-4 flex gap-2 border-t bg-background px-4 py-3">
        <Button onClick={done} disabled={saving}>
          {saving ? 'Saving…' : 'Done'}
        </Button>
        <Button variant="ghost" onClick={() => (onPending({}), setRows(initialRows), onClose())} disabled={saving}>
          Cancel
        </Button>
      </div>
      <section className="grid gap-2 border-t pt-4">
        {workspace.tabs.length > 1 ? (
          <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
            <AlertDialogTrigger render={<Button variant="outline" className="justify-self-start text-destructive" disabled={saving} />}>Remove view</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {tab.title}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the tab from soii.config.yml. Your notes stay as they are, and git can undo it.
                  {untouchedBuiltIn && ` This copies ${workspace.title} into your soii.config.yml first.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <p className="text-xs text-muted-foreground">{workspace.title} needs at least one view, so this one can't be removed.</p>
        )}
      </section>
    </aside>
  )
}
