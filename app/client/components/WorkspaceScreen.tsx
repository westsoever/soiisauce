// app/client/components/WorkspaceScreen.tsx
// One workspace: a 48px tab strip above the content sheet (miso's SpaceScreen
// layout). /w/<ws> lands on the last-opened tab, else the first.
import { IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo } from 'react'
import { notePath } from '../../lib/paths'
import { specForTab } from '../../lib/new-note'
import { runTab } from '../../lib/query'
import type { VaultIndex } from '../../lib/types'
import { navigate, workspacePath } from '../lib/router'
import { readJson, storageKeys, writeJson } from '../lib/storage'
import { Button } from '../ui/button'
import { handlesEmpty, views } from '../views/registry'
import { AddNoteButton } from './AddNoteDialog'
import { EmptyTab, NothingHere } from './EmptyTab'
import { openSearch } from './SearchPalette'
import { TabStrip } from './TabStrip'
import { ViewBoundary } from './ViewBoundary'

export function WorkspaceScreen({ workspaceId, tabId, index }: { workspaceId: string; tabId?: string; index: VaultIndex }) {
  const workspace = index.config.workspaces.find(w => w.id === workspaceId)
  const tab = workspace?.tabs.find(t => t.id === tabId)

  useEffect(() => {
    if (!workspace || tab) return
    const last = readJson<string | null>(storageKeys.lastTab(workspace.id), null)
    const target = workspace.tabs.find(t => t.id === last) ?? workspace.tabs[0]
    navigate(workspacePath(workspace.id, target.id), { replace: true })
  }, [workspace, tab])

  useEffect(() => {
    if (workspace && tab) writeJson(storageKeys.lastTab(workspace.id), tab.id)
  }, [workspace, tab])

  const tabNotes = useMemo(
    () => (workspace ? Object.fromEntries(workspace.tabs.map(t => [t.id, runTab(t, index)])) : {}),
    [workspace, index]
  )

  if (!workspace) return <NothingHere message={`There's no workspace called ${workspaceId}.`} />
  const notes = tab ? (tabNotes[tab.id] ?? []) : []
  const View = tab ? views[tab.view] : null
  const addSpec = tab ? specForTab(workspace.id, tab, index.config) : null
  const showEmpty = notes.length === 0 && !(tab && handlesEmpty.has(tab.view))

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 md:h-12 md:px-3">
        <h1 className="max-w-28 shrink-0 truncate px-2 text-base font-medium md:hidden">{workspace.title}</h1>
        <TabStrip workspace={workspace} activeTab={tab?.id} tabNotes={tabNotes} />
        {addSpec && <AddNoteButton key={addSpec.type} spec={addSpec} notes={index.notes} />}
        <Button variant="ghost" size="icon" aria-label="Search" className="md:hidden" onClick={openSearch}>
          <IconSearch stroke={1.75} />
        </Button>
      </header>
      <main className="relative min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
        {tab && View && showEmpty && <EmptyTab tab={tab} />}
        {tab && View && !showEmpty && (
          <ViewBoundary key={`${workspace.id}/${tab.id}`} view={tab.view}>
            <View workspace={workspace} tab={tab} notes={notes} index={index} openNote={id => navigate(notePath(id))} />
          </ViewBoundary>
        )}
      </main>
    </div>
  )
}
