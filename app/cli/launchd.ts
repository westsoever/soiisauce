// app/cli/launchd.ts
export interface LaunchState {
  state: string
  pid: number | null
}

/** The bits of `launchctl print gui/<uid>/<label>` that `soii status` shows. */
export function parseLaunchctlPrint(text: string): LaunchState {
  const state = /^\s*state = (.+)$/m.exec(text)?.[1]?.trim() ?? 'unknown'
  const pid = /^\s*pid = (\d+)$/m.exec(text)?.[1]
  return { state, pid: pid ? Number(pid) : null }
}
