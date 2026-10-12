// app/cli/registry.ts
// ~/.config/soii/config.json: which vault this machine's soii serves, and on which port.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_PORT = 5011

export interface Registry {
  vault: string
  port: number
}

export function configDir(env: Record<string, string | undefined> = process.env): string {
  return env.SOII_CONFIG_DIR?.trim() || join(env.HOME ?? '', '.config', 'soii')
}

const file = (dir: string) => join(dir, 'config.json')

export function readRegistry(dir: string): Registry | null {
  const path = file(dir)
  if (!existsSync(path)) return null
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`${path} isn't valid JSON. Fix it or delete it, then run \`soii install\` again.`)
  }
  const { vault, port } = (raw ?? {}) as { vault?: unknown; port?: unknown }
  if (typeof vault !== 'string' || !vault) throw new Error(`${path} has no "vault". Run \`soii install\` in your vault.`)
  return { vault, port: typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT }
}

export function writeRegistry(dir: string, registry: Registry): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(file(dir), `${JSON.stringify(registry, null, 2)}\n`)
}

export function removeRegistry(dir: string): void {
  rmSync(file(dir), { force: true })
}
