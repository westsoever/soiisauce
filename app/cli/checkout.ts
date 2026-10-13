// app/cli/checkout.ts
// soii's code lives in <vault>/.soii/soii: a shallow git checkout of the pinned tag. It is fetched with git, not with
// `bun install github:…`: git works the same for the public repo and for a private fork, with whatever login the
// machine already has (`gh auth setup-git`, the keychain, ssh).
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Ctx } from './context'
import { remoteFromEnv } from './vault-files'
import { parseTag } from './version'

export const remoteUrl = (ctx: Ctx): string => remoteFromEnv(ctx.env)
export const soiiCheckout = (vault: string): string => join(vault, '.soii', 'soii')

/** The tag the checkout is exactly at, or null (a branch, or no checkout). */
export async function installedRef(ctx: Ctx, vault: string): Promise<string | null> {
  const dir = soiiCheckout(vault)
  if (!existsSync(join(dir, '.git'))) return null
  const r = await ctx.exec('git', ['describe', '--tags', '--exact-match'], { cwd: dir })
  return r.code === 0 ? r.out.split('\n')[0] : null
}

const isSoiiCheckout = (dir: string): boolean => {
  try {
    return existsSync(join(dir, '.git')) && (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string }).name === 'soii'
  } catch {
    return false
  }
}

/**
 * Put `ref` (a release tag, or a branch for testing) in <vault>/.soii/soii. A tag that is already there is left alone.
 * The new copy is cloned beside the old one and swapped in, so a failed fetch keeps the working install.
 * `prepare` runs on the new copy before the swap (it installs the packages): a CLI without node_modules can't start, and
 * the `soii` command and the service run whatever is in .soii/soii. If it returns false, nothing is swapped.
 */
export async function checkoutSoii(
  ctx: Ctx,
  vault: string,
  ref: string,
  prepare?: (dir: string) => Promise<boolean>
): Promise<{ ok: true; changed: boolean } | { ok: false; message: string }> {
  const dir = soiiCheckout(vault)
  const next = `${dir}.new`
  const old = `${dir}.old`
  if (existsSync(dir)) {
    if (!isSoiiCheckout(dir)) return { ok: false, message: `${dir} exists but isn't a soii checkout, so it was left alone. Move it away and try again.` }
    if (parseTag(ref) && (await installedRef(ctx, vault)) === ref) return { ok: true, changed: false }
  }
  rmSync(next, { recursive: true, force: true })
  const clone = await ctx.exec('git', ['clone', '--quiet', '--depth', '1', '--branch', ref, remoteUrl(ctx), next], { timeoutMs: 300_000 })
  if (clone.code !== 0) {
    rmSync(next, { recursive: true, force: true })
    return { ok: false, message: `git could not fetch soii ${ref} from ${remoteUrl(ctx)}: ${clone.out.split('\n').pop() ?? 'unknown error'}` }
  }
  if (prepare && !(await prepare(next))) {
    rmSync(next, { recursive: true, force: true })
    return { ok: false, message: `soii ${ref} was fetched but its packages could not be installed, so nothing was changed${existsSync(dir) ? ' and the soii you have keeps working' : ''}.` }
  }
  rmSync(old, { recursive: true, force: true })
  if (existsSync(dir)) renameSync(dir, old)
  renameSync(next, dir)
  rmSync(old, { recursive: true, force: true })
  return { ok: true, changed: true }
}
