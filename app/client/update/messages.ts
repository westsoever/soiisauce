// app/client/update/messages.ts
import type { VersionInfo } from '../../lib/types'

/** The one way to update (D105): it prints what's new and the release links, rebuilds and restarts. */
export const UPDATE_COMMAND = 'soii update'

export function updateMessage(info: VersionInfo): string {
  const have = info.installed ? ` (you have ${info.installed})` : ''
  return `soii ${info.latest} is available${have}. Run ${UPDATE_COMMAND} in a terminal.`
}
