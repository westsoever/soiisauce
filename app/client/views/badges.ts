// Optional per-view tab badges: TabStrip shows a small dot next to a tab's
// title when its view's predicate returns true. Kept apart from registry.ts so
// views that need no badge never touch this file.
import { hasToday } from '../../lib/feed'
import type { NoteMeta, TabConfig, ViewName } from '../../lib/types'

export type TabBadge = (notes: NoteMeta[], tab: TabConfig) => boolean

function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export const tabBadges: Partial<Record<ViewName, TabBadge>> = {
  // A feed tab has news when one of its notes is dated today, in the reader's own timezone.
  feed: (notes, tab) => hasToday(notes, tab, browserZone())
}
