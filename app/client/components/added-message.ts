// app/client/components/added-message.ts
/** The toast after "Add" in local mode: the server committed the file (or says why not). */
export function localAddedMessage(path: string, warning: string | null | undefined, canSync: boolean): string {
  if (warning?.startsWith('Committed')) return `Saved and committed ${path}.${canSync ? ' Press Sync to push it.' : ''}`
  return warning || `Saved ${path}.`
}
