// The cover fallback: the title set in the workspace font on a soft,
// title-hashed accent. Used when there's no image or the image fails to load.
import { cn } from '../../ui/utils'
import { initials, pickAccent } from './accent'

export function TypographicTile({ title, className }: { title: string; className?: string }) {
  const accent = pickAccent(title)
  return (
    <div
      role="img"
      aria-label={title}
      className={cn('relative flex size-full flex-col justify-between overflow-hidden p-3 text-foreground', className)}
      style={{ background: `color-mix(in oklch, ${accent} 18%, var(--card))` }}
    >
      <span
        aria-hidden
        className="text-2xl leading-none font-medium tabular-nums"
        style={{ color: `color-mix(in oklch, ${accent} 70%, var(--foreground))` }}
      >
        {initials(title)}
      </span>
      <span aria-hidden className="line-clamp-4 font-sans text-sm leading-snug font-medium">
        {title}
      </span>
    </div>
  )
}
