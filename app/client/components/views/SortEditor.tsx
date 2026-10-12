// app/client/components/views/SortEditor.tsx
// "Sort · the order they're shown in": field + direction rows. The form uses max={1}; the panel allows "Then by".
import { IconPlus, IconX } from '@tabler/icons-react'
import type { SortKey } from '../../../lib/types'
import { Button } from '../../ui/button'
import { cn } from '../../ui/utils'
import { SELECT_CLASS } from './FilterEditor'

export const SORT_FIELDS_BASE = ['date', 'updated', 'title']

export function SortEditor({ sort, onChange, fields, max }: { sort: SortKey[]; onChange: (sort: SortKey[]) => void; fields: string[]; max?: number }) {
  const options = [...new Set([...SORT_FIELDS_BASE, ...fields])]
  const set = (i: number, key: SortKey) => onChange(sort.map((k, j) => (j === i ? key : k)))
  return (
    <div className="grid gap-2">
      {sort.map((key, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-muted-foreground">{i === 0 ? 'Sort by' : 'Then by'}</span>
          <select aria-label="Sort field" className={cn(SELECT_CLASS, 'min-w-0 flex-1')} value={key.field} onChange={e => set(i, { ...key, field: e.target.value })}>
            {[...new Set([key.field, ...options])].map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select aria-label="Direction" className={cn(SELECT_CLASS, 'w-40 shrink-0')} value={key.dir} onChange={e => set(i, { ...key, dir: e.target.value as SortKey['dir'] })}>
            <option value="asc">A → Z / oldest</option>
            <option value="desc">Z → A / newest</option>
          </select>
          {(max === undefined || max > 1) && (
            <Button variant="ghost" size="icon" aria-label="Remove sort" onClick={() => onChange(sort.filter((_, j) => j !== i))}>
              <IconX size={16} />
            </Button>
          )}
        </div>
      ))}
      {(max === undefined || sort.length < max) && (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...sort, { field: 'title', dir: 'asc' }])}>
          <IconPlus size={16} /> {sort.length ? 'Then by' : 'Add a sort'}
        </Button>
      )}
      {sort.length === 0 && <span className="text-xs text-muted-foreground">Default order: newest first, then by title.</span>}
    </div>
  )
}
