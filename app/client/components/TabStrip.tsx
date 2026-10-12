// app/client/components/TabStrip.tsx
// A workspace's tabs with match counts. Gets each tab's matched notes (not just
// a count) so per-view badges can inspect them (Plan 4).
import { useEffect, useRef, useState } from 'react'
import type { NoteMeta, WorkspaceConfig } from '../../lib/types'
import { iconFor } from '../lib/icons'
import { navigate, workspacePath } from '../lib/router'
import { cn } from '../ui/utils'
import { tabBadges } from '../views/badges'

export function TabStrip({ workspace, activeTab, tabNotes }: { workspace: WorkspaceConfig; activeTab?: string; tabNotes: Record<string, NoteMeta[]> }) {
  const navRef = useRef<HTMLElement>(null)
  const [more, setMore] = useState(false)
  const update = () => {
    const nav = navRef.current
    if (nav) setMore(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1)
  }
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [activeTab])

  return (
    <nav
      ref={navRef}
      onScroll={update}
      aria-label={`${workspace.title} tabs`}
      className={cn(
        // Tabs sit on the header's bottom edge so the active one joins the sheet below.
        'flex min-w-0 flex-1 self-stretch items-end gap-0.5 overflow-x-auto px-2 [scrollbar-width:none]',
        more && '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]'
      )}
    >
      {workspace.tabs.map(tab => {
        const notes = tabNotes[tab.id] ?? []
        const count = notes.length
        const showBadge = tabBadges[tab.view]?.(notes, tab) ?? false
        const Icon = tab.icon ? iconFor(tab.icon) : null
        const active = tab.id === activeTab
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(workspacePath(workspace.id, tab.id))}
            className={cn(
              'relative flex h-11 md:h-9 shrink-0 items-center gap-1.5 rounded-t-lg px-3 text-sm transition-colors',
              active ? 'soii-folder-tab z-10 bg-background font-medium text-foreground' : 'text-foreground/70 hover:bg-background/50 hover:text-foreground'
            )}
          >
            {active && <span aria-hidden className="soii-folder-tab-edge" />}
            {Icon && <Icon size={16} stroke={1.75} />}
            <span className="whitespace-nowrap">{tab.title}</span>
            {showBadge && <span role="img" aria-label="New today" className="size-1.5 shrink-0 rounded-full bg-primary" />}
            <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          </button>
        )
      })}
    </nav>
  )
}
