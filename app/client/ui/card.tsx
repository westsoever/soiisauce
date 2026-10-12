import type { ComponentProps } from 'react'
import { cn } from './utils'

type CardProps = ComponentProps<'div'> & { size?: 'default' | 'sm' }

// A framed object (DESIGN.md: one frame per section). A leading <img> bleeds to the top edge.
export function Card({ className, size = 'default', ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col overflow-hidden rounded-xl bg-card text-sm text-card-foreground shadow-xs',
        size === 'sm' ? 'gap-3 py-3' : 'gap-4 py-4',
        className
      )}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-4 group-data-[size=sm]/card:px-3', className)}
      {...props}
    />
  )
}
