// app/lib/merge-config.ts
// Merges a vault's soii.config.yml over the defaults (spec §6.2 merge rule):
// workspaces replace by id or append; types merge by key; scalars override.
import { validateConfig, validateUserConfig } from './config-schema'
import { DEFAULT_CONFIG } from './default-config'
import type { SoiiConfig } from './types'

export function resolveConfig(raw: unknown, defaults: SoiiConfig = DEFAULT_CONFIG): SoiiConfig {
  const user = validateUserConfig(raw ?? {})
  const base = structuredClone(defaults)
  const workspaces = user.replaceDefaultWorkspaces ? [] : base.workspaces
  for (const ws of user.workspaces ?? []) {
    const i = workspaces.findIndex(w => w.id === ws.id)
    if (i >= 0) workspaces[i] = ws
    else workspaces.push(ws)
  }
  return validateConfig({
    title: user.title ?? base.title,
    home: user.home ?? base.home,
    exclude: user.exclude ?? base.exclude,
    types: { ...base.types, ...user.types },
    workspaces,
    ...(user.obsidianVault ? { obsidianVault: user.obsidianVault } : {}),
    ...(user.currency ? { currency: user.currency } : {})
  })
}
