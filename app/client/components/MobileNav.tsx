// app/client/components/MobileNav.tsx
// Below md: the bottom bar. The first three workspaces, a raised Log button in the middle, and
// More (other workspaces, Vault, Search, Sign out). Padded for the iPhone home indicator.
import { IconDots, IconPlus } from '@tabler/icons-react'
import type { VaultIndex, WorkspaceConfig } from '../../lib/types'
import { signOut } from '../lib/http'
import { iconFor } from '../lib/icons'
import { logPath, navigate, useRoute, workspacePath } from '../lib/router'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { cn } from '../ui/utils'
import { openSearch } from './SearchPalette'

const ITEM = 'flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors'

function WorkspaceItem({ workspace, active }: { workspace: WorkspaceConfig; active: boolean }) {
  const Icon = iconFor(workspace.icon ?? 'file')
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => navigate(workspacePath(workspace.id))}
      className={cn(ITEM, active ? 'text-foreground' : 'text-muted-foreground')}
    >
      <Icon size={22} stroke={active ? 2 : 1.75} />
      <span className="max-w-full truncate px-1">{workspace.title}</span>
    </button>
  )
}

export function MobileNav({ index }: { index: VaultIndex }) {
  const route = useRoute()
  const workspaces = index.config.workspaces
  const [first, second, third] = workspaces
  const rest = workspaces.slice(3)
  const current = route.page === 'workspace' ? route.workspace : null
  const moreActive = route.page === 'vault' || (current !== null && rest.some(w => w.id === current))
  return (
    <nav aria-label="Main" className="flex shrink-0 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {first && <WorkspaceItem workspace={first} active={current === first.id} />}
      {second && <WorkspaceItem workspace={second} active={current === second.id} />}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          aria-label="Log"
          onClick={() => navigate(logPath())}
          className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
        >
          <IconPlus size={26} stroke={2} />
        </button>
      </div>
      {third && <WorkspaceItem workspace={third} active={current === third.id} />}
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" className={cn(ITEM, moreActive ? 'text-foreground' : 'text-muted-foreground')} />}>
          <IconDots size={22} stroke={1.75} />
          <span>More</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-56">
          {rest.map(ws => (
            <DropdownMenuItem key={ws.id} className="min-h-11" onClick={() => navigate(workspacePath(ws.id))}>
              {ws.title}
            </DropdownMenuItem>
          ))}
          {rest.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem className="min-h-11" onClick={() => navigate('/vault')}>
            Vault
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onClick={openSearch}>
            Search
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onClick={() => void signOut()}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
