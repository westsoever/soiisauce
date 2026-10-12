// Short, self-dismissing messages at the bottom of the screen.
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconX } from '@tabler/icons-react'
import { useSyncExternalStore } from 'react'
import { Button } from '../ui/button'

type Toast = { id: number; tone: 'info' | 'success' | 'error'; message: string }

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export function toast(message: string, tone: Toast['tone'] = 'info'): void {
  const id = nextId++
  toasts = [...toasts, { id, tone, message }]
  emit()
  setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000)
}

function dismiss(id: number): void {
  toasts = toasts.filter(t => t.id !== id)
  emit()
}

const ICON = { info: IconInfoCircle, success: IconCheck, error: IconAlertTriangle }

export function Toaster() {
  const list = useSyncExternalStore(
    l => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts
  )
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {list.map(t => {
        const Icon = ICON[t.tone]
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg bg-popover py-2 pr-1 pl-3 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
          >
            <Icon
              size={16}
              stroke={1.75}
              className={t.tone === 'error' ? 'mt-0.5 text-destructive' : t.tone === 'success' ? 'mt-0.5 text-success' : 'mt-0.5 text-muted-foreground'}
            />
            <span className="flex-1 py-px">{t.message}</span>
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <IconX stroke={1.75} />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
