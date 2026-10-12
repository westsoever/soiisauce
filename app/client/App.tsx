// app/client/App.tsx
// The signed-in shell: muted page, sidebar, and the routed screen (spec §6.3, §9).
import { useEffect } from 'react'
import { NothingHere } from './components/EmptyTab'
import { MobileNav } from './components/MobileNav'
import { SearchPalette } from './components/SearchPalette'
import { Sidebar } from './components/Sidebar'
import { WorkspaceScreen } from './components/WorkspaceScreen'
import { HttpError } from './lib/http'
import { LogScreen } from './log/LogScreen'
import { useVault } from './lib/queries'
import { useFreshVault } from './lib/use-fresh-vault'
import { navigate, useRoute, workspacePath } from './lib/router'
import { applyWorkspaceTheme } from './lib/theme'
import { NoteReader } from './reader/NoteReader'
import { SkillsPage } from './skills/SkillsPage'
import { Skeleton } from './ui/skeleton'
import { VaultPage } from './vault/VaultPage'

export function App() {
  const vault = useVault()
  const route = useRoute()
  useFreshVault()
  const workspaces = vault.data?.config.workspaces ?? []
  const current = route.page === 'workspace' ? workspaces.find(w => w.id === route.workspace) : undefined

  useEffect(() => {
    applyWorkspaceTheme(current?.theme)
  }, [current?.theme])

  // "/" lands on the home workspace (or the first one, or the vault).
  useEffect(() => {
    if (!vault.data || route.page !== 'home') return
    const home = workspaces.find(w => w.id === vault.data.config.home) ?? workspaces[0]
    navigate(home ? workspacePath(home.id) : '/vault', { replace: true })
  }, [vault.data, route.page, workspaces])

  useEffect(() => {
    if (vault.data && route.page !== 'note') document.title = vault.data.config.title
  }, [vault.data, route.page])

  if (vault.isPending) {
    return (
      <div className="flex h-dvh gap-4 bg-muted p-4">
        <Skeleton className="h-full w-52 max-md:hidden" />
        <Skeleton className="h-full flex-1" />
      </div>
    )
  }
  if (vault.isError) {
    const notBuilt = vault.error instanceof HttpError && vault.error.status === 503
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-muted p-4 text-center text-sm">
        <p className="font-medium">{notBuilt ? "The vault hasn't been compiled yet." : "Couldn't load the vault."}</p>
        <p className="text-muted-foreground">{vault.error.message}</p>
      </div>
    )
  }

  const index = vault.data
  return (
    <div className="flex h-dvh overflow-hidden bg-muted">
      <Sidebar index={index} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {route.page === 'workspace' && <WorkspaceScreen key={route.workspace} workspaceId={route.workspace} tabId={route.tab} index={index} />}
          {route.page === 'note' && <NoteReader key={route.id} id={route.id} />}
          {route.page === 'vault' && <VaultPage index={index} />}
          {route.page === 'skills' && <SkillsPage index={index} />}
          {route.page === 'log' && <LogScreen index={index} kindId={route.kind} />}
          {route.page === 'not-found' && <NothingHere />}
        </div>
        {/* The Log is a full-screen flow with its own Close/Back. */}
        {route.page !== 'log' && <MobileNav index={index} />}
      </div>
      <SearchPalette />
    </div>
  )
}
