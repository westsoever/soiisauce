// app/client/log/LogDone.tsx
// After a 201: where it went and what to do next.
// "Open note" waits until the note is in soii's index (after the rebuild).
import { IconCircleCheck } from '@tabler/icons-react'
import type { LogKind, LogResponse } from '../../lib/log'
import { notePath } from '../../lib/paths'
import type { VaultIndex } from '../../lib/types'
import { navigate } from '../lib/router'
import { Button } from '../ui/button'

export function LogDone({ kind, title, response, index, onAgain }: { kind: LogKind; title: string; response: LogResponse; index: VaultIndex; onAgain: () => void }) {
  const note = index.notes.find(n => n.path === response.path)
  return (
    <div className="flex h-full flex-col">
      <header className="h-14 shrink-0 md:h-12" />
      <main className="min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
        <div role="status" className="mx-auto grid max-w-md gap-3 px-6 py-10 text-center">
          <IconCircleCheck size={44} stroke={1.5} className="mx-auto text-success" />
          <h1 className="text-xl font-medium tracking-tight">Logged {response.mode === 'append' ? `to ${title}` : title}</h1>
          <p className="text-sm break-all text-muted-foreground">{response.path}</p>
          <p className="text-sm">Saved in your local vault.</p>
          {response.warning && <p className="text-sm text-muted-foreground">{response.warning}</p>}
          <div className="mt-4 grid gap-2">
            <Button size="lg" onClick={onAgain}>
              Log another {kind.label.toLowerCase()}
            </Button>
            {note && (
              <Button size="lg" variant="outline" onClick={() => navigate(notePath(note.id))}>
                Open note
              </Button>
            )}
            <Button size="lg" variant="ghost" onClick={() => navigate('/')}>
              Done
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
