// Feed header: the long date, a Today badge, Older/Newer steppers, and on
// narrow screens a date picker (the desktop list lives in DateList).
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { formatDate } from '../../../lib/format'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { OpenNoteLink } from './OpenNoteLink'

type Props = {
  date: string
  heading: string
  isToday: boolean
  newer: string | null
  older: string | null
  dates: string[]
  openNote?: () => void
  onSelect: (date: string) => void
}

export function FeedNav({ date, heading, isToday, newer, older, dates, openNote, onSelect }: Props) {
  const items = dates.map(d => ({ value: d, label: formatDate(d, 'short') }))
  return (
    <header className="mb-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 truncate text-base font-medium">{heading}</h2>
        {openNote && <OpenNoteLink onClick={openNote} />}
        <span className="flex-1" />
        {isToday && <Badge variant="secondary">Today</Badge>}
        <Button variant="ghost" size="icon-sm" aria-label="Older" disabled={!older} onClick={() => older && onSelect(older)}>
          <IconChevronLeft stroke={1.75} />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Newer" disabled={!newer} onClick={() => newer && onSelect(newer)}>
          <IconChevronRight stroke={1.75} />
        </Button>
      </div>
      <Select value={date} items={items} onValueChange={value => value && onSelect(value)}>
        <SelectTrigger aria-label="Pick a date" className="w-full tabular-nums lg:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map(item => (
            <SelectItem key={item.value} value={item.value} className="tabular-nums">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </header>
  )
}
