// app/client/log/KindPicker.tsx
// /log: big tiles for the everyday kinds, chips for the rest, and the unsent draft (if any).
import { IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { kindById, LOG_KINDS } from '../../lib/log'
import { goBack, logPath, navigate } from '../lib/router'
import { readJson, storageKeys, writeJson } from '../lib/storage'
import { Button } from '../ui/button'
import { cn } from '../ui/utils'
import { clearDraft, loadDraft } from './draft'
import { kindIcon } from './kind-icons'

export function KindPicker() {
  const [draft, setDraft] = useState(() => loadDraft())
  const last = readJson<string | null>(storageKeys.lastLogKind, null)
  const draftKind = draft ? kindById(draft.kind) : null
  const open = (id: string) => {
    writeJson(storageKeys.lastLogKind, id)
    navigate(logPath(id))
  }
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-2 md:h-12 md:px-3">
        <Button variant="ghost" size="icon" aria-label="Close" onClick={goBack}>
          <IconX stroke={1.75} />
        </Button>
        <h1 className="flex-1 text-base font-medium md:text-sm">Log</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
        {/* Desktop: equal flexible rows above and below pin the tile grid's middle to the screen's middle. */}
        <div className="mx-auto grid max-w-xl gap-6 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:min-h-full md:grid-rows-[1fr_auto_1fr]">
          <div className="self-end max-md:empty:hidden">
          {draft && draftKind && (
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">Unsent {draftKind.label.toLowerCase()}</div>
                <div className="truncate text-muted-foreground">{draft.target?.title || draft.text.slice(0, 60) || 'Draft'}</div>
              </div>
              <Button size="sm" onClick={() => navigate(logPath(draftKind.id))}>
                Continue
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearDraft()
                  setDraft(null)
                }}
              >
                Discard
              </Button>
            </div>
          )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {LOG_KINDS.filter(k => !k.secondary).map(k => {
              const Icon = kindIcon(k.id)
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => open(k.id)}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border bg-background text-sm font-medium transition-colors hover:bg-accent active:bg-accent md:aspect-[4/3]',
                    k.id === last && 'ring-2 ring-primary/60'
                  )}
                >
                  <Icon size={28} stroke={1.5} />
                  {k.label}
                </button>
              )
            })}
          </div>
          <div className="grid gap-2 self-start">
            <h2 className="text-xs font-medium text-muted-foreground">More</h2>
            <div className="flex flex-wrap gap-2">
              {LOG_KINDS.filter(k => k.secondary).map(k => {
                const Icon = kindIcon(k.id)
                return (
                  <button key={k.id} type="button" onClick={() => open(k.id)} className="flex h-11 items-center gap-2 rounded-full border px-4 text-sm hover:bg-accent md:h-8 md:px-3">
                    <Icon size={16} stroke={1.75} />
                    {k.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
