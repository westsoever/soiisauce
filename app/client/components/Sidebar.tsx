// app/client/components/Sidebar.tsx
// The left rail (miso's Sidebar layout): soii. wordmark, workspaces from config,
// Log, Skills, Vault, Search (⌘K), and the signed-in user with sign-out. Hidden below md.
import { IconFolder, IconLogout, IconPencilPlus, IconRefresh, IconSearch, IconSparkles } from '@tabler/icons-react'
import { useState } from 'react'
import type { VaultIndex, WorkspaceConfig } from '../../lib/types'
import { api, signOut } from '../lib/http'
import { iconFor } from '../lib/icons'
import { useCapabilities, useMe } from '../lib/queries'
import { navigate, useRoute, workspacePath } from '../lib/router'
import { toast } from '../lib/toast'
import { cn } from '../ui/utils'
import { UpdateNoticeRow } from '../update/UpdateNotice'
import { openSearch } from './SearchPalette'

function NavRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors',
        active ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function WorkspaceIcon({ workspace }: { workspace: WorkspaceConfig }) {
  if (workspace.icon) {
    const Icon = iconFor(workspace.icon)
    return (
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Icon size={16} stroke={1.75} />
      </span>
    )
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-medium text-muted-foreground uppercase">
      {workspace.title.slice(0, 1)}
    </span>
  )
}

function SyncButton() {
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      // The server pulls; the dev server rebuilds; useFreshVault then reloads the open page.
      const result = await api<{ summary: string }>('/api/sync', { method: 'POST', body: {} })
      toast(result.summary, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't sync.", 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void run()}
      className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
    >
      <IconRefresh size={16} stroke={1.75} className={cn('mx-0.5', busy && 'animate-spin')} />
      {busy ? 'Syncing…' : 'Sync'}
    </button>
  )
}

export function Sidebar({ index }: { index: VaultIndex }) {
  const route = useRoute()
  const me = useMe()
  const capabilities = useCapabilities()
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col gap-4 px-3 py-4 max-md:hidden">
      <div className="px-2 text-base font-medium tracking-tight">soii.</div>
      {/* Scrolling clips both axes, so pad by the active row's shadow ring (and pull back with -m-1) to keep it whole. */}
      <nav aria-label="Workspaces" className="-m-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
        {index.config.workspaces.map(ws => (
          <NavRow key={ws.id} active={route.page === 'workspace' && route.workspace === ws.id} onClick={() => navigate(workspacePath(ws.id))}>
            <WorkspaceIcon workspace={ws} />
            <span className="truncate">{ws.title}</span>
          </NavRow>
        ))}
      </nav>
      <div className="flex flex-col gap-0.5">
        <NavRow active={route.page === 'log'} onClick={() => navigate('/log')}>
          <IconPencilPlus size={16} stroke={1.75} className="mx-0.5" />
          Log
        </NavRow>
        <NavRow active={route.page === 'skills'} onClick={() => navigate('/skills')}>
          <IconSparkles size={16} stroke={1.75} className="mx-0.5" />
          Skills
        </NavRow>
        <NavRow active={route.page === 'vault'} onClick={() => navigate('/vault')}>
          <IconFolder size={16} stroke={1.75} className="mx-0.5" />
          Vault
        </NavRow>
        <NavRow active={false} onClick={openSearch}>
          <IconSearch size={16} stroke={1.75} className="mx-0.5" />
          <span className="flex-1">Search</span>
          <kbd className="font-mono text-xs text-muted-foreground">⌘K</kbd>
        </NavRow>
        {capabilities.data?.sync && <SyncButton />}
        <UpdateNoticeRow />
        <div className="mt-2 flex h-8 items-center gap-2 px-2 text-xs text-muted-foreground">
          {me.data?.avatarUrl ? <img src={me.data.avatarUrl} alt="" className="size-5 rounded-full" referrerPolicy="no-referrer" /> : null}
          <span className="min-w-0 flex-1 truncate">{me.data ? `@${me.data.login}` : ''}</span>
          <button type="button" aria-label="Sign out" title="Sign out" className="rounded-md p-1 hover:bg-accent hover:text-foreground" onClick={() => void signOut()}>
            <IconLogout size={16} stroke={1.75} />
          </button>
        </div>
      </div>
    </aside>
  )
}
