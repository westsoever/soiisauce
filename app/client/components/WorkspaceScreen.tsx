// app/client/components/WorkspaceScreen.tsx
// One workspace: a 48px tab strip above the content sheet (miso's SpaceScreen
// layout). /w/<ws> lands on the last-opened tab, else the first.
import { IconDots, IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { notePath } from '../../lib/paths'
import { specForTab } from '../../lib/new-note'
import { runTab } from '../../lib/query'
import type { VaultIndex } from '../../lib/types'
import { applyPending } from '../../lib/view-filter'
import { useCapabilities } from '../lib/queries'
import { navigate, workspacePath } from '../lib/router'
import { readJson, storageKeys, writeJson } from '../lib/storage'
import { Button } from '../ui/button'
import { handlesEmpty, views } from '../views/registry'
import { AddNoteButton } from './AddNoteDialog'
import { EmptyTab, NothingHere } from './EmptyTab'
import { openSearch } from './SearchPalette'
import { TabStrip } from './TabStrip'
import { ViewBoundary } from './ViewBoundary'
import { NewViewButton } from './views/NewViewDialog'
import { ViewSettingsPanel, type PendingView } from './views/ViewSettingsPanel'

type SettingsState = { key: string; open: boolean; pending: PendingView }
const NO_PENDING: PendingView = {}

export function WorkspaceScreen({ workspaceId, tabId, index }: { workspaceId: string; tabId?: string; index: VaultIndex }) {
  const workspace = index.config.workspaces.find(w => w.id === workspaceId)
  const tab = workspace?.tabs.find(t => t.id === tabId)
  const capabilities = useCapabilities()
  const canWrite = capabilities.data?.write === true
  // The settings panel's state belongs to the tab it was opened on. Anything stored for another tab is ignored,
  // and dropped as soon as it's seen, so a pending filter can never show on, or be saved to, a different tab.
  const tabKey = workspace && tab ? `${workspace.id}/${tab.id}` : null
  const [settings, setSettings] = useState<SettingsState | null>(null)
  if (settings && settings.key !== tabKey) setSettings(null)
  const mine = settings !== null && settings.key === tabKey
  const settingsOpen = mine && settings.open
  const pending = mine ? settings.pending : NO_PENDING
  // An in-flight save finishes after a tab switch: its callbacks must not touch the tab we're on now.
  const activeKey = useRef(tabKey)
  useEffect(() => {
    activeKey.current = tabKey
  }, [tabKey])
  const panelFor = (key: string) => ({
    isStale: () => activeKey.current !== key,
    onPending: (p: PendingView) => {
      if (activeKey.current === key) setSettings({ key, open: true, pending: p })
    },
    onClose: () => {
      if (activeKey.current === key) setSettings({ key, open: false, pending: {} })
    }
  })

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
  // While the settings panel is open, the visible tab previews the pending filter and sort.
  const shown = tab ? applyPending(tab, pending) : undefined
  const notes = shown ? (Object.keys(pending).length ? runTab(shown, index) : (tabNotes[shown.id] ?? [])) : []
  const View = shown ? views[shown.view] : null
  const addSpec = tab ? specForTab(workspace.id, tab, index.config) : null
  const showEmpty = notes.length === 0 && !(shown && handlesEmpty.has(shown.view))

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 md:h-12 md:px-3">
        <h1 className="max-w-28 shrink-0 truncate px-2 text-base font-medium md:hidden">{workspace.title}</h1>
        <TabStrip workspace={workspace} activeTab={tab?.id} tabNotes={tabNotes} />
        {canWrite && <NewViewButton workspace={workspace} index={index} />}
        {canWrite && tab && (
          <Button variant="ghost" size="icon" aria-label={`${tab.title} settings`} aria-expanded={settingsOpen} onClick={() => tabKey && setSettings({ key: tabKey, open: !settingsOpen, pending: {} })}>
            <IconDots stroke={1.75} />
          </Button>
        )}
        {addSpec && <AddNoteButton key={addSpec.type} spec={addSpec} notes={index.notes} />}
        <Button variant="ghost" size="icon" aria-label="Search" className="md:hidden" onClick={openSearch}>
          <IconSearch stroke={1.75} />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="relative min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
          {shown && View && showEmpty && <EmptyTab tab={shown} />}
          {shown && View && !showEmpty && (
            <ViewBoundary key={`${workspace.id}/${shown.id}`} view={shown.view}>
              <View workspace={workspace} tab={shown} notes={notes} index={index} openNote={id => navigate(notePath(id))} />
            </ViewBoundary>
          )}
        </main>
        {settingsOpen && tab && tabKey && <ViewSettingsPanel workspace={workspace} tab={tab} index={index} pending={pending} {...panelFor(tabKey)} />}
      </div>
    </div>
  )
}
