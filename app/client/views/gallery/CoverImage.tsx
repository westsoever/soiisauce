// Cover with graceful fallback: no src, a 404 from /api/cover, or a broken
// upstream image all render the typographic tile instead of a broken icon.
import { useEffect, useState } from 'react'
import { cn } from '../../ui/utils'
import type { Aspect } from './options'
import { TypographicTile } from './TypographicTile'

const ASPECT_CLASS: Record<Aspect, string> = {
  poster: 'aspect-[2/3]',
  square: 'aspect-square',
  video: 'aspect-video'
}

export function CoverImage({
  src,
  title,
  aspect,
  className
}: {
  src: string | null
  title: string
  aspect: Aspect
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  return (
    <div className={cn('relative w-full overflow-hidden bg-muted', ASPECT_CLASS[aspect], className)}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <TypographicTile title={title} className="absolute inset-0" />
      )}
    </div>
  )
}
