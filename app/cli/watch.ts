// app/cli/watch.ts
// Which vault changes should rebuild soii. Same rule the compiler uses to skip files (app/vault/walk.ts):
// dot-entries and node_modules. That also keeps `.soii/build` (soii's own output, inside the vault) from retriggering itself.
// The exception is what the Skills page is built from: `.claude/skills/<name>/SKILL.md` and `.soii/skills.json`.
// A new skill folder is reported as the folder (or its parents) before its SKILL.md, so those count too.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_SOURCES = /^(\.claude(\/skills(\/[^/]+(\/SKILL\.md)?)?)?|\.soii\/skills\.json)$/

export function isIgnoredVaultPath(rel: string | null): boolean {
  if (!rel) return true
  const path = rel.replace(/\\/g, '/')
  if (SKILL_SOURCES.test(path)) return false
  return path.split('/').some(part => part.startsWith('.') || part === 'node_modules')
}

/**
 * Whether an event for `rel` is a real change: its size or modification time differs from the last event for it
 * (a missing path counts as a change once; a folder always counts). macOS reports some reads and copies as changes to the file, and a
 * rebuild that does one of those must not trigger the next rebuild.
 */
export function changeFilter(vaultDir: string): (rel: string) => boolean {
  const seen = new Map<string, string>()
  return rel => {
    let sig = 'gone'
    try {
      const s = statSync(join(vaultDir, rel))
      // A folder's time changes only when entries come or go, not when a file in it is edited, so folders always count.
      if (s.isDirectory()) return true
      sig = `${s.size}:${s.mtimeMs}`
    } catch {}
    if (seen.get(rel) === sig) return false
    seen.set(rel, sig)
    return true
  }
}

/**
 * What the Skills page is built from, as one string: each `.claude/skills/<name>/SKILL.md` and `.soii/skills.json` with its size and
 * modification time. `soii run` compares it on a timer as well as watching, because Bun 1.2 on Linux does not report anything inside a
 * folder that did not exist when the watch began (a vault's first skill creates `.claude/skills/<name>/` in one go).
 */
export function skillSignature(vaultDir: string): string {
  const parts: string[] = []
  const stat = (rel: string) => {
    try {
      const s = statSync(join(vaultDir, rel))
      parts.push(`${rel}:${s.size}:${s.mtimeMs}`)
    } catch {}
  }
  let names: string[] = []
  try {
    names = readdirSync(join(vaultDir, '.claude', 'skills')).sort()
  } catch {}
  for (const name of names) stat(`.claude/skills/${name}/SKILL.md`)
  stat('.soii/skills.json')
  return parts.join('\n')
}
