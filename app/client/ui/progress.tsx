import type { ComponentProps } from 'react'
import { cn } from './utils'

type ProgressProps = Omit<ComponentProps<'div'>, 'children'> & { value: number | null }

// A thin read-only bar. The width is computed at runtime, which is the one place DESIGN.md allows inline style.
export function Progress({ value, className, ...props }: ProgressProps) {
  const pct = value === null || Number.isNaN(value) ? 0 : Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : pct}
      data-slot="progress"
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
    </div>
  )
}
