// app/vault/skills.ts
// The vault's Claude Code skills for the Skills page, read at build time. `.claude` is a dot folder, so the note walk never
// sees it; only each skill's name and description are read (never the body), and nothing else in `.claude`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseSkillMd } from '../lib/skills'
import type { SkillMeta } from '../lib/types'

function skillFolders(dir: string): string[] {
  return readdirSync(dir)
    .filter(name => !name.startsWith('.') && existsSync(join(dir, name, 'SKILL.md')) && statSync(join(dir, name)).isDirectory())
    .sort()
}

function manifestNames(vaultDir: string): Set<string> | null {
  try {
    const raw = (JSON.parse(readFileSync(join(vaultDir, '.soii', 'skills.json'), 'utf8')) as { skills?: unknown }).skills
    return Array.isArray(raw) ? new Set(raw.filter((n): n is string => typeof n === 'string')) : null
  } catch {
    return null
  }
}

/**
 * `<vault>/.claude/skills/<id>/SKILL.md`. A skill is soii's when `.soii/skills.json` lists it (soii install writes that);
 * without a manifest, when soii itself ships a skill of that name. If the vault has no `.claude/skills` at all (a dev run
 * against a plain vault), `shippedDir` (soii's own skills) stands in, so the page isn't empty.
 */
export function readSkills(vaultDir: string, shippedDir?: string): SkillMeta[] {
  const own = join(vaultDir, '.claude', 'skills')
  const shipped = shippedDir && existsSync(shippedDir) ? skillFolders(shippedDir) : []
  const usingShipped = !existsSync(own)
  const dir = usingShipped ? shippedDir : own
  if (!dir || !existsSync(dir)) return []
  const soiiNames = usingShipped ? null : (manifestNames(vaultDir) ?? new Set(shipped))
  return skillFolders(dir).map(id => {
    const { name, description } = parseSkillMd(readFileSync(join(dir, id, 'SKILL.md'), 'utf8'), id)
    return { id, name, description, soii: soiiNames === null ? true : soiiNames.has(id) }
  })
}
