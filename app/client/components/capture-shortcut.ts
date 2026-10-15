// app/client/components/capture-shortcut.ts
/** Option-P (Alt-P) and nothing else. Matched on the physical key: on a Mac, Option-P arrives as e.key "π". */
export function isCaptureShortcut(e: Pick<KeyboardEvent, 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'code'>): boolean {
  return e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyP'
}

/** The toast after a capture: where it went, plus git's reason when it wasn't committed. */
export function capturedMessage(path: string, warning: string | null | undefined): string {
  if (!warning || warning.startsWith('Committed')) return `Captured → ${path}`
  // commitLocal's reasons start "Saved. …" or "Saved, but …": read on from the path instead.
  return warning.startsWith('Saved') ? `Captured → ${path}${warning.slice('Saved'.length)}` : `Captured → ${path}. ${warning}`
}
