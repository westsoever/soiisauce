import { IconStar, IconStarFilled, IconStarHalfFilled } from '@tabler/icons-react'

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground" aria-label={`Rated ${rating} of 5`} role="img">
      {[1, 2, 3, 4, 5].map(i => {
        const Icon = rating >= i ? IconStarFilled : rating >= i - 0.5 ? IconStarHalfFilled : IconStar
        return <Icon key={i} size={12} stroke={1.75} aria-hidden />
      })}
    </span>
  )
}
