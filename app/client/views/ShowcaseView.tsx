// The showcase view: rows of picture, title and a short description, two columns from md up.
// The picture is 4:5 and exactly as tall as a Library book cover in the M grid: same
// columns per breakpoint and gap as GRID_COLUMNS.m, 2:3 covers, measured on this list's width.
import type { ViewProps } from '../../lib/types'
import { cn } from '../ui/utils'
import { OptionsError } from './cells'
import { CoverImage } from './gallery/CoverImage'
import { showcaseOptionsSchema, showcaseRow } from './showcase'

// Cover height = 1.5 × column width; column width = (list width − gaps) / columns.
const COLUMNS = '[--cols:3] sm:[--cols:4] md:[--cols:5] lg:[--cols:6] xl:[--cols:8]'
const THUMB = 'h-[calc((100cqw_-_(var(--cols)_-_1)_*_0.75rem)_/_var(--cols)_*_1.5)] w-auto aspect-[4/5]'

export function ShowcaseView({ tab, notes, openNote }: ViewProps) {
  const parsed = showcaseOptionsSchema.safeParse(tab.options ?? {})
  if (!parsed.success) return <OptionsError view="showcase" error={parsed.error} />
  const options = parsed.data
  return (
    <div className="p-4">
      <ul data-showcase className={cn('@container grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2', COLUMNS)}>
        {notes.map(note => {
          const row = showcaseRow(note, options)
          return (
            <li key={note.id} className="[contain-intrinsic-size:auto_12rem] [content-visibility:auto]">
              <button
                type="button"
                onClick={() => openNote(note.id)}
                className="flex w-full items-start gap-4 rounded-xl p-1 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CoverImage src={row.image} title={row.title} aspect="square" className={cn('shrink-0 rounded-lg', THUMB)} />
                <span className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                  <span className="line-clamp-2 text-base leading-snug font-medium">{row.title}</span>
                  {row.subtitle && <span className="truncate text-xs text-muted-foreground">{row.subtitle}</span>}
                  {row.description && <span className="line-clamp-3 text-sm text-muted-foreground md:line-clamp-4">{row.description}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default ShowcaseView
