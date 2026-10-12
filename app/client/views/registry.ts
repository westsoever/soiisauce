// app/client/views/registry.ts
// One line per view. Plans 2–4 each replace their FallbackView line (spec §6.4).
import type { ComponentType } from 'react'
import type { ViewName, ViewProps } from '../../lib/types'
import { BoardView } from './BoardView'
import { FeedView } from './FeedView'
import { GalleryView } from './GalleryView'
import { ListView } from './ListView'
import { PulseView } from './PulseView'
import { ShowcaseView } from './ShowcaseView'
import { StatsView } from './StatsView'
import { TableView } from './TableView'

export const views: Record<ViewName, ComponentType<ViewProps>> = {
  list: ListView,
  table: TableView,
  gallery: GalleryView,
  board: BoardView,
  stats: StatsView,
  feed: FeedView,
  pulse: PulseView,
  showcase: ShowcaseView
}

// Views that render their own empty state. WorkspaceScreen mounts them even when the
// tab matches no notes, instead of showing the generic EmptyTab. Plan 4 adds 'feed' (spec §13).
export const handlesEmpty: ReadonlySet<ViewName> = new Set<ViewName>(['feed'])
