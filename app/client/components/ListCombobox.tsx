// A short list of values (collection, category): the chosen ones as removable chips, then an
// input that suggests the values already in the vault, with counts, and accepts a new one.
// Enter, a comma or leaving the field adds what's typed; picking a suggestion adds it at once.
import { IconX } from '@tabler/icons-react'
import { useId, useState } from 'react'
import { MAX_LIST_ITEMS, type Facet } from '../../lib/collections'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'

const split = (value: string) => value.split(',').map(v => v.trim()).filter(Boolean)

export function ListCombobox({
  label,
  value,
  onChange,
  suggestions,
  className
}: {
  label: string
  value: string
  onChange: (value: string) => void
  suggestions: Facet[]
  className?: string
}) {
  const listId = useId()
  const [text, setText] = useState('')
  const items = split(value)
  const full = items.length >= MAX_LIST_ITEMS

  const add = (raw: string) => {
    const item = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
    setText('')
    if (!item || items.some(i => i.toLowerCase() === item.toLowerCase())) return
    onChange([...items, item].join(', '))
  }

  return (
    <div className="grid gap-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <Badge key={`${i}-${item}`} variant="secondary" className="gap-1 pr-0.5">
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="flex size-6 items-center justify-center rounded-sm hover:bg-background/60"
                onClick={() => onChange(items.filter((_, j) => j !== i).join(', '))}
              >
                <IconX size={12} stroke={1.75} />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        aria-label={label}
        list={listId}
        disabled={full}
        placeholder={full ? `At most ${MAX_LIST_ITEMS}` : 'Pick one or type a new one'}
        className={className}
        value={text}
        onChange={e => {
          const v = e.target.value
          // A datalist pick arrives as insertReplacementText (or, in some browsers, a plain Event).
          // Typing a value that equals a suggestion ("AI" on the way to "AI Ethics") must not add it.
          const native = e.nativeEvent
          const picked = !(native instanceof InputEvent) || native.inputType === 'insertReplacementText'
          if (v.endsWith(',')) add(v.slice(0, -1))
          else if (picked && suggestions.some(s => s.value === v)) add(v)
          else setText(v)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            add(text)
          }
        }}
        onBlur={() => add(text)}
      />
      <datalist id={listId}>
        {suggestions.map(s => (
          <option key={s.key} value={s.value} label={`${s.label} · ${s.count}`} />
        ))}
      </datalist>
    </div>
  )
}
