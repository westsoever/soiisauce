// app/client/views/FallbackView.tsx
// Stand-in for views a later plan adds (spec §6.4): a table without the tab's
// view-specific options, plus a one-line notice.
import type { ViewProps } from '../../lib/types'
import { TableView } from './TableView'

export function FallbackView(props: ViewProps) {
  return (
    <div>
      <p className="px-4 pt-3 text-xs text-muted-foreground">This view isn't available yet; showing a table.</p>
      <TableView {...props} tab={{ ...props.tab, options: undefined }} />
    </div>
  )
}
