// app/cli/paths.ts
// Where soii puts its things on a machine, and the shim that puts `soii` on PATH.
import { basename, join } from 'node:path'

export interface ShimChoice {
  dir: string
  onPath: boolean
}

const strip = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/** Where the `soii` command can go, best first. Only folders that are already on PATH are used, so the command is found at once. */
export const shimCandidates = (home: string): string[] => [join(home, '.bun', 'bin'), join(home, '.local', 'bin'), join(home, 'bin'), '/opt/homebrew/bin', '/usr/local/bin']

/** The first of those that is on PATH, exists and can be written to (~/.bun/bin first: bun is required anyway), else ~/.local/bin, and says it is not on PATH. */
export function chooseShimDir(o: { home: string; pathEnv: string; exists: (dir: string) => boolean; writable?: (dir: string) => boolean }): ShimChoice {
  const onPath = o.pathEnv.split(':').map(strip)
  for (const dir of shimCandidates(o.home)) if (onPath.includes(dir) && o.exists(dir) && (o.writable?.(dir) ?? true)) return { dir, onPath: true }
  return { dir: join(o.home, '.local', 'bin'), onPath: false }
}

/** What to paste, once, to put `dir` on PATH for good, in the shell this person uses; and where to run `soii` from until then. */
export function pathInstruction(o: { dir: string; home: string; shell: string; platform: string }): string {
  const rel = o.dir.startsWith(`${o.home}/`) ? `$HOME/${o.dir.slice(o.home.length + 1)}` : o.dir
  const shell = basename(o.shell)
  const file = shell === 'zsh' ? '~/.zshrc' : shell === 'bash' ? (o.platform === 'darwin' ? '~/.bash_profile' : '~/.bashrc') : null
  const how = shell === 'fish' ? `fish_add_path "${rel}"` : file ? `echo 'export PATH="${rel}:$PATH"' >> ${file}` : `add this line to your shell's startup file: export PATH="${rel}:$PATH"`
  return `The \`soii\` command is in ${o.dir}, which your terminal doesn't search yet. To fix that for good, paste this once:\n\n    ${how}\n\nthen open a new terminal window. Until then, run it as ${join(o.dir, 'soii')} (for example \`${join(o.dir, 'soii')} open\`).`
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
