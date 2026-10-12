// app/client/log/FieldInput.tsx
// The Log's compact inputs: chips for choices, tappable stars, a Today/Yesterday date, plain
// inputs for the rest. 44px tall below md (thumb-sized), the usual size on desktop.
import type { Facet } from '../../lib/collections'
import { localDay, type LogField } from '../../lib/log'
import { ListCombobox } from '../components/ListCombobox'
import { Input } from '../ui/input'
import { cn } from '../ui/utils'

export function Chips({
  label,
  options,
  labels,
  value,
  onChange
}: {
  label: string
  options: string[]
  labels?: Record<string, string>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(option => {
        const on = value === option
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? '' : option)}
            className={cn(
              'h-11 rounded-full border px-4 text-sm transition-colors md:h-8 md:px-3',
              on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent'
            )}
          >
            {labels?.[option] ?? option}
          </button>
        )
      })}
    </div>
  )
}

export function Stars({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const n = Number(value) || 0
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={n === i}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          onClick={() => onChange(n === i ? '' : String(i))}
          className={cn('flex size-11 items-center justify-center rounded-lg text-2xl md:size-8 md:text-xl', i <= n ? 'text-foreground' : 'text-muted-foreground/40')}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function WhenInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const today = localDay()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterday = localDay(y)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chips label="When" options={[today, yesterday]} labels={{ [today]: 'Today', [yesterday]: 'Yesterday' }} value={value} onChange={v => onChange(v || today)} />
      <Input aria-label="Date" type="date" className="h-11 w-auto md:h-8" value={value} onChange={e => e.target.value && onChange(e.target.value)} />
    </div>
  )
}

export function FieldInput({ field, value, onChange, suggestions }: { field: LogField; value: string; onChange: (value: string) => void; suggestions?: Facet[] }) {
  if (field.kind === 'select') return <Chips label={field.label} options={field.options ?? []} labels={field.labels} value={value} onChange={onChange} />
  if (field.kind === 'rating') return <Stars value={value} onChange={onChange} />
  if (field.kind === 'list') return <ListCombobox label={field.label} value={value} onChange={onChange} suggestions={suggestions ?? []} className="h-11 md:h-8" />
  return (
    <Input
      aria-label={field.label}
      className="h-11 md:h-8"
      type={field.kind === 'date' ? 'date' : 'text'}
      inputMode={field.kind === 'number' ? 'decimal' : undefined}
      placeholder={field.placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}
