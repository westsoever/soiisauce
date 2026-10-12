// app/client/reader/Outline.tsx
// Heading outline beside the note on wide screens (≥ xl, spec §9).
import type { Heading } from '../../lib/types'
import { cn } from '../ui/utils'

export function Outline({ headings }: { headings: Heading[] }) {
  const items = headings.filter(h => h.depth >= 2 && h.depth <= 4)
  if (items.length < 2) return null
  return (
    <nav aria-label="Outline" className="sticky top-6 hidden w-56 shrink-0 self-start xl:block">
      <p className="mb-2 text-xs font-medium text-muted-foreground">On this page</p>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map(h => (
          <li key={h.slug} className={cn(h.depth === 3 && 'pl-3', h.depth === 4 && 'pl-6')}>
            <a
              href={`#${h.slug}`}
              onClick={e => {
                e.preventDefault()
                history.replaceState(null, '', `#${encodeURIComponent(h.slug)}`)
                document.getElementById(h.slug)?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="block truncate text-muted-foreground hover:text-foreground"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
