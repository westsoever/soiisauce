import type { ComponentProps } from 'react'
import { cn } from './utils'

const SIZES = { sm: 'size-6 text-xs', default: 'size-8 text-sm', lg: 'size-10 text-sm' } as const

type AvatarProps = ComponentProps<'span'> & { size?: keyof typeof SIZES }

export function Avatar({ size = 'default', className, ...props }: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      data-size={size}
      className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full bg-muted shadow-xs select-none', SIZES[size], className)}
      {...props}
    />
  )
}

export function AvatarFallback({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn('flex size-full items-center justify-center text-muted-foreground', className)}
      {...props}
    />
  )
}
