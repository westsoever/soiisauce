// app/client/components/Sidebar.tsx
// The left rail (miso's Sidebar layout): soii. wordmark, workspaces from config,
// Log, Skills, Vault, Search (⌘K), Sync and the update notice. Hidden below md.
import { IconBolt, IconFolder, IconPencilPlus, IconRefresh, IconSearch, IconSparkles } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { VaultIndex, WorkspaceConfig } from '../../lib/types'
import { api, HttpError } from '../lib/http'
import { iconFor } from '../lib/icons'
import { fetchCapabilities, keys, useCapabilities } from '../lib/queries'
import { navigate, useRoute, workspacePath } from '../lib/router'
import { confirmedRemotes, needsConfirm, rememberRemote } from '../lib/sync-confirm'
import { toast } from '../lib/toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../ui/alert-dialog'
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

type SyncDialog = { kind: 'confirm'; remote: string } | { kind: 'connect'; message: string }

// The server says "not_connected" (or "not_a_repo") in plain words when there is nowhere to sync to; that is shown in a
// dialog that stays up long enough to copy the command from, not a toast.
const NOT_CONNECTED = ['not_connected', 'not_a_repo']

function SyncButton({ remote }: { remote: string | null }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<SyncDialog | null>(null)

  async function run() {
    setBusy(true)
    try {
      // The server pulls (and in local mode pushes); it rebuilds on what changed; useFreshVault then reloads the open page.
      const result = await api<{ summary: string }>('/api/sync', { method: 'POST', body: {} })
      toast(result.summary, 'success')
      // The server also looked for a newer soii while syncing: show the notice now, not at the next poll.
      void queryClient.invalidateQueries({ queryKey: keys.version })
      void queryClient.invalidateQueries({ queryKey: keys.capabilities })
    } catch (err) {
      const code = err instanceof HttpError ? (err.body as { error?: string } | null)?.error : undefined
      if (err instanceof HttpError && code && NOT_CONNECTED.includes(code)) setDialog({ kind: 'connect', message: err.message })
      else toast(err instanceof Error ? err.message : "Couldn't sync.", 'error')
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    setBusy(true)
    // Ask again rather than trust the page's copy: the vault may have been connected (or pointed elsewhere) since it loaded.
    let current = remote
    try {
      current = (await queryClient.fetchQuery({ queryKey: keys.capabilities, queryFn: fetchCapabilities, staleTime: 0 })).remote ?? null
    } catch {
      // the server decides below
    }
    if (needsConfirm(current, confirmedRemotes(localStorage))) {
      setBusy(false)
      setDialog({ kind: 'confirm', remote: current as string })
    } else {
      await run()
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        title={remote ? `Pull the latest notes from ${remote} and push your commits to it` : 'Pull the latest notes and push your commits to GitHub'}
        className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
      >
        <IconRefresh size={16} stroke={1.75} className={cn('mx-0.5', busy && 'animate-spin')} />
        {busy ? 'Syncing…' : 'Sync'}
      </button>
      <AlertDialog open={dialog !== null} onOpenChange={open => !open && setDialog(null)}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-md">
          {dialog?.kind === 'confirm' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Pull and push your notes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Sync pulls the latest notes from <span className="font-medium break-all text-foreground">{dialog.remote}</span> and pushes the commits soii and you made here to it. Anyone who can see that repository can read what is pushed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not now</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    rememberRemote(localStorage, dialog.remote)
                    setDialog(null)
                    void run()
                  }}
                >
                  Pull &amp; push
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {dialog?.kind === 'connect' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Connect this vault to GitHub</AlertDialogTitle>
                <AlertDialogDescription className="break-words select-text">{dialog.message}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function Sidebar({ index }: { index: VaultIndex }) {
  const route = useRoute()
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
        <NavRow active={route.page === 'speed'} onClick={() => navigate('/speed')}>
          <IconBolt size={16} stroke={1.75} className="mx-0.5" />
          Speed reader
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
        {capabilities.data?.sync && <SyncButton remote={capabilities.data.remote ?? null} />}
        <UpdateNoticeRow />
      </div>
    </aside>
  )
}
