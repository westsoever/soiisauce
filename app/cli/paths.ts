// app/cli/paths.ts
// Where soii puts its things on a machine, and the shim that puts `soii` on PATH.
import { join } from 'node:path'

export interface ShimChoice {
  dir: string
  onPath: boolean
}

const strip = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/** ~/.bun/bin if it's on PATH (bun is required anyway), else ~/.local/bin; says whether the pick is on PATH. */
export function chooseShimDir(o: { home: string; pathEnv: string; exists: (dir: string) => boolean }): ShimChoice {
  const onPath = o.pathEnv.split(':').map(strip)
  const bunBin = join(o.home, '.bun', 'bin')
  const localBin = join(o.home, '.local', 'bin')
  for (const dir of [bunBin, localBin]) if (onPath.includes(dir) && o.exists(dir)) return { dir, onPath: true }
  return { dir: localBin, onPath: false }
}

export const logPath = (platform: string, home: string): string =>
  platform === 'darwin' ? join(home, 'Library', 'Logs', 'soii.log') : join(home, '.local', 'state', 'soii', 'soii.log')

export const plistPath = (home: string): string => join(home, 'Library', 'LaunchAgents', 'com.soii.server.plist')

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** The global `soii` command: runs the CLI pinned inside the registered vault, so the CLI and the app are the same version. */
export function renderShim(o: { bun: string; script: string }): string {
  return `#!/bin/sh
# soii shim, written by \`soii install\`. \`soii uninstall\` removes it.
exec ${sq(o.bun)} ${sq(o.script)} "$@"
`
}
