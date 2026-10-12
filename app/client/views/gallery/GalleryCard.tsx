import { IconNote } from '@tabler/icons-react'
import { Badge } from '../../ui/badge'
import { Card } from '../../ui/card'
import { CoverImage } from './CoverImage'
import type { Aspect, CardSpec } from './options'
import { Stars } from './Stars'
import { cn } from '../../ui/utils'

export function GalleryCard({
  card,
  aspect,
  onOpen,
  className,
  noted
}: {
  card: CardSpec
  aspect: Aspect
  onOpen: () => void
  className?: string
  noted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('group/gallery rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      <Card size="sm" className="h-full gap-2 pt-0 shadow-xs ring-0 transition-shadow group-hover/gallery:shadow-sm">
        <CoverImage src={card.image} title={card.title} aspect={aspect} />
        <div className="flex min-w-0 flex-col gap-1 px-3">
          <span className="line-clamp-2 leading-snug font-medium">{card.title}</span>
          {card.subtitle && <span className="truncate text-muted-foreground">{card.subtitle}</span>}
          {(card.rating !== null || card.badge || noted) && (
            <span className="flex flex-wrap items-center gap-2">
              {card.rating !== null && <Stars rating={card.rating} />}
              {card.badge && <Badge variant="secondary">{card.badge}</Badge>}
              {noted && <IconNote size={12} stroke={1.75} role="img" aria-label="Has my notes" className="text-muted-foreground" />}
            </span>
          )}
        </div>
      </Card>
    </button>
  )
}
