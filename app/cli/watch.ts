// app/cli/watch.ts
// Which vault changes should rebuild soii. Same rule the compiler uses to skip files (app/vault/walk.ts):
// dot-entries and node_modules. That also keeps `.soii/build` (soii's own output, inside the vault) from retriggering itself.
// The exception is what the Skills page is built from: `.claude/skills/<name>/SKILL.md` and `.soii/skills.json`.
// A new skill folder is reported as the folder (or its parents) before its SKILL.md, so those count too.
const SKILL_SOURCES = /^(\.claude(\/skills(\/[^/]+(\/SKILL\.md)?)?)?|\.soii\/skills\.json)$/

export function isIgnoredVaultPath(rel: string | null): boolean {
  if (!rel) return true
  const path = rel.replace(/\\/g, '/')
  if (SKILL_SOURCES.test(path)) return false
  return path.split('/').some(part => part.startsWith('.') || part === 'node_modules')
}
