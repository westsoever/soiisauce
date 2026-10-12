// Desktop list of the most recent feed dates (spec §13: last 30), with a dot on today.
import { formatDate } from '../../../lib/format'
import { cn } from '../../ui/utils'

type Props = { dates: string[]; selected: string; today: string; onSelect: (date: string) => void; className?: string }

export function DateList({ dates, selected, today, onSelect, className }: Props) {
  return (
    <nav aria-label="Dates" className={cn('w-52 shrink-0 overflow-auto p-3', className)}>
      <ul className="flex flex-col gap-0.5">
        {dates.map(date => (
          <li key={date}>
            <button
              type="button"
              aria-current={date === selected ? 'date' : undefined}
              onClick={() => onSelect(date)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm tabular-nums',
                date === selected
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <span>{formatDate(date, 'short')}</span>
              {date === today && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
