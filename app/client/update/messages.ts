// app/client/update/messages.ts
import type { VersionInfo } from '../../lib/types'

/** The one path to promote: the skill explains what's new and checks the result. */
export const UPDATE_COMMAND = '/soii-update'

export function updateMessage(info: VersionInfo): string {
  const have = info.installed ? ` (you have ${info.installed})` : ''
  return `soii ${info.latest} is available${have}. Run ${UPDATE_COMMAND} in Claude Code.`
}
