// app/cli/vault-dir.ts
// Which vault a command that reads notes works on (`soii view`, `soii recall`): --vault, else the current folder, else
// the vault soii is installed in. It must look like a vault, so a write never lands in a random folder.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Flags } from './args'
import type { Ctx } from './context'
import { configDir, readRegistry } from './registry'

/** A wrong argument or no vault: the command prints the message and exits 2. */
export class ArgError extends Error {}

const VAULT_MARKERS = ['soii.config.yml', 'soii.config.yaml', '.soii', '.obsidian']
const isVault = (dir: string) => VAULT_MARKERS.some(n => existsSync(join(dir, n)))
const notAVault = (dir: string) => new ArgError(`${dir} is not a soii vault (no soii.config.yml, .soii/ or .obsidian/ in it). Run this inside your vault, or pass --vault <folder>.`)

export function vaultDir(ctx: Ctx, flags: Flags): string {
  if (flags.vault) {
    const dir = resolve(ctx.cwd, flags.vault)
    if (!isVault(dir)) throw notAVault(dir)
    return dir
  }
  if (isVault(ctx.cwd)) return ctx.cwd
  const reg = readRegistry(configDir(ctx.env))
  if (!reg) throw new ArgError('No vault here. Run this inside your vault, or pass --vault <folder>.')
  if (!isVault(reg.vault)) throw notAVault(reg.vault)
  return reg.vault
}
