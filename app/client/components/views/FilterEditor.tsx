// app/client/components/views/FilterEditor.tsx
// "Filter · which notes are in this view": a type picker and "+ Add filter" rows (field + values). Shared by
// the New view form and the Filter panel. Rows ↔ query conversion is app/lib/view-filter.ts.
import { IconPlus, IconX } from '@tabler/icons-react'
import { useMemo } from 'react'
import type { NoteMeta } from '../../../lib/types'
import { fieldValues, vaultFields } from '../../../lib/view-fields'
import type { FilterRow } from '../../../lib/view-filter'
import { Button } from '../../ui/button'
import { ListCombobox } from '../ListCombobox'

export const SELECT_CLASS =
  'h-8 w-full rounded-lg border bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'

const COMMON = [
  { field: 'tag', label: 'Tag' },
  { field: 'category', label: 'Category' },
  { field: 'collection', label: 'Collection' },
  { field: 'status', label: 'Status' },
  { field: 'folder', label: 'Folder' }
]
const split = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)

export function FilterEditor({ rows, onChange, notes }: { rows: FilterRow[]; onChange: (rows: FilterRow[]) => void; notes: NoteMeta[] }) {
  const typeRow = rows.find(r => r.field === 'type')
  const others = rows.filter(r => r.field !== 'type')
  const ofType = useMemo(() => (typeRow?.values.length ? notes.filter(n => n.type !== null && typeRow.values.includes(n.type)) : notes), [notes, typeRow])
  const extraFields = useMemo(() => vaultFields(ofType).fields.map(f => f.field).filter(f => !COMMON.some(c => c.field === f)), [ofType])
  const used = new Set(rows.map(r => r.field))

  const setType = (value: string) => onChange([...(split(value).length ? [{ field: 'type', values: split(value) }] : []), ...others])
  const setRow = (i: number, row: FilterRow) => onChange([...(typeRow ? [typeRow] : []), ...others.map((r, j) => (j === i ? row : r))])
  const removeRow = (i: number) => onChange([...(typeRow ? [typeRow] : []), ...others.filter((_, j) => j !== i)])
  const nextField = [...COMMON.map(c => c.field), ...extraFields].find(f => !used.has(f))

  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Type</span>
        <ListCombobox label="Type" value={(typeRow?.values ?? []).join(', ')} onChange={setType} suggestions={fieldValues(notes, 'type')} />
        {!typeRow?.values.length && <span className="text-xs text-muted-foreground">No type picked: every kind of note can show up.</span>}
      </label>
      {others.map((row, i) => (
        <div key={i} className="grid gap-1.5 rounded-lg border p-2">
          <div className="flex items-center gap-2">
            <select aria-label="Field" className={SELECT_CLASS} value={row.field} onChange={e => setRow(i, { field: e.target.value, values: [] })}>
              {COMMON.filter(c => c.field === row.field || !used.has(c.field)).map(c => (
                <option key={c.field} value={c.field}>
                  {c.label}
                </option>
              ))}
              {[...extraFields, ...(COMMON.some(c => c.field === row.field) || extraFields.includes(row.field) ? [] : [row.field])]
                .filter(f => f === row.field || !used.has(f))
                .map(f => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
            </select>
            <Button variant="ghost" size="icon" aria-label="Remove filter" onClick={() => removeRow(i)}>
              <IconX size={16} />
            </Button>
          </div>
          <ListCombobox label={row.field} value={row.values.join(', ')} onChange={v => setRow(i, { field: row.field, values: split(v) })} suggestions={fieldValues(ofType, row.field)} />
        </div>
      ))}
      {nextField && (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...rows, { field: nextField, values: [] }])}>
          <IconPlus size={16} /> Add filter
        </Button>
      )}
    </div>
  )
}
