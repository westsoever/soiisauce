// app/client/components/CaptureDialog.tsx
// Option-P quick capture: a box in the middle of the screen; Enter saves the text as a new Inbox note
// (POST /api/capture), Shift-Enter adds a line, Esc closes. Mounted once in App.tsx, like SearchPalette.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { localDay } from '../../lib/log'
import { api } from '../lib/http'
import { toast } from '../lib/toast'
import { builtAt, waitForRebuild } from '../lib/use-fresh-vault'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { capturedMessage, isCaptureShortcut } from './capture-shortcut'

export function CaptureDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  // Kept across Esc, so a half-written thought isn't lost; cleared once it's saved.
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCaptureShortcut(e)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function save() {
    if (saving || !text.trim()) return
    setSaving(true)
    try {
      const before = await builtAt()
      const saved = await api<{ path: string; warning: string | null }>('/api/capture', { method: 'POST', body: { text, date: localDay() } })
      toast(capturedMessage(saved.path, saved.warning), 'success')
      setText('')
      setOpen(false)
      void waitForRebuild(queryClient, before)
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't capture that.", 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Capture to the Inbox</DialogTitle>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void save()
            }
          }}
          readOnly={saving}
          id="capture-text"
          name="text"
          rows={3}
          placeholder="Capture a thought"
          aria-label="Capture a thought"
          className="field-sizing-content max-h-[50vh] min-h-24 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <p className="px-4 py-2 text-xs text-muted-foreground shadow-[0_-1px_0_var(--border)]">
          {saving ? 'Saving…' : 'Enter to save to the Inbox · Shift-Enter for a new line · Esc to close'}
        </p>
      </DialogContent>
    </Dialog>
  )
}
