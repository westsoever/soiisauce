// app/cli/vault-scan.ts
// What the install wizard needs to know about an existing vault, read-only: how many notes have a type, which
// folders are full of notes that don't, and what `soii check` finds in one line.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConfigError } from '../lib/config-schema'
import { resolveConfig } from '../lib/merge-config'
import { TYPE_FIELDS } from '../lib/type-fields'
import type { SoiiConfig } from '../lib/types'
import { loadConfig } from '../vault/compile'
import { deriveFields, parseFrontmatter } from '../vault/frontmatter'
import { walkVault } from '../vault/walk'
import { inspectVault } from '../../scripts/check-vault'
import { decodeBase64Markdown } from '../../scripts/find-base64-notes'

export interface FolderStat {
  /** Vault-relative with a trailing slash, e.g. `Reading/Books/`. */
  path: string
  notes: number
  untyped: number
}

export interface VaultScan {
  notes: number
  untyped: number
  /** Folders where most notes have no type, biggest first (at most `limit`). */
  folders: FolderStat[]
}

const loadConfigOrDefault = (root: string): SoiiConfig => {
  try {
    return loadConfig(root)
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    return resolveConfig({})
  }
}

/** Folders that hold templates or plumbing, never a "type" for the notes in them. */
const SKIP_FOLDER = /^(templates?|attachments?|assets|archive)$/i

/** Does this folder hold any markdown note (so it can be a vault)? Dot-folders and excluded folders don't count. */
export function countNotes(root: string): number {
  return walkVault(root, loadConfigOrDefault(root).exclude).markdown.length
}

/**
 * Count typed and untyped notes, and find the folders worth asking about: the top-level folders (or, when a folder
 * only wraps other folders, those inside it) where more than half of the notes have no `type`. Notes soii can't read
 * or that are hidden are left out of the counts, because the normaliser leaves them alone as well.
 */
export function scanVault(root: string, limit = 10): VaultScan {
  const config = loadConfigOrDefault(root)
  const { markdown, fsPaths } = walkVault(root, config.exclude)
  let notes = 0
  let untyped = 0
  const tops = new Map<string, { total: number; untyped: number; direct: number; subs: Map<string, { total: number; untyped: number }> }>()
  for (const path of markdown) {
    const source = readFileSync(join(root, fsPaths.get(path) ?? path), 'utf8')
    if (decodeBase64Markdown(source) !== null) continue
    const parsed = parseFrontmatter(source)
    if (parsed.error) continue
    const fields = deriveFields(parsed.data, path, config.types)
    if (fields.hidden) continue
    notes++
    const noType = fields.type === null
    if (noType) untyped++
    const parts = path.split('/')
    if (parts.length < 2) continue
    const top = tops.get(parts[0]) ?? { total: 0, untyped: 0, direct: 0, subs: new Map() }
    top.total++
    if (noType) top.untyped++
    if (parts.length === 2) top.direct++
    else {
      const sub = top.subs.get(parts[1]) ?? { total: 0, untyped: 0 }
      sub.total++
      if (noType) sub.untyped++
      top.subs.set(parts[1], sub)
    }
    tops.set(parts[0], top)
  }

  const units: FolderStat[] = []
  for (const [name, top] of tops) {
    if (SKIP_FOLDER.test(name)) continue
    // A folder that mostly wraps other folders ("Notes/Books", "Notes/People") is asked about folder by folder.
    if (top.subs.size >= 2 && top.direct < top.total * 0.2) {
      for (const [sub, s] of top.subs) if (!SKIP_FOLDER.test(sub)) units.push({ path: `${name}/${sub}/`, notes: s.total, untyped: s.untyped })
    } else units.push({ path: `${name}/`, notes: top.total, untyped: top.untyped })
  }
  const folders = units
    .filter(u => u.untyped * 2 > u.notes)
    .sort((a, b) => b.notes - a.notes || (a.path < b.path ? -1 : 1))
    .slice(0, limit)
  return { notes, untyped, folders }
}

export interface CheckSummary {
  /** One friendly line, e.g. "Checked 120 notes: 80 have no type, 25 lack some properties, 2 problems soii can't read." */
  line: string
  /** Typed notes that lack some of their type's documented properties. */
  missingProps: number
}

export async function summariseVault(root: string): Promise<CheckSummary> {
  const scan = scanVault(root)
  const check = await inspectVault(root)
  const missingProps = new Set(check.findings.filter(f => f.rule === 'missing-field').map(f => f.path)).size
  const problems = new Set(check.findings.filter(f => f.severity === 'error').map(f => f.path)).size
  const bits = [`${scan.untyped} ${scan.untyped === 1 ? 'has' : 'have'} no type yet`, `${missingProps} ${missingProps === 1 ? 'lacks' : 'lack'} some properties`]
  if (problems) bits.push(`${problems} ${problems === 1 ? 'problem' : 'problems'} soii can't read (run \`soii check\` to see them)`)
  return { line: `Checked ${scan.notes} ${scan.notes === 1 ? 'note' : 'notes'}: ${bits.join(', ')}.`, missingProps }
}

const HINTS: Record<string, string> = {
  book: 'books you read',
  audiobook: 'books you listen to',
  movie: 'films',
  documentary: 'documentaries',
  video: 'videos, talks, YouTube',
  research: 'papers',
  article: 'articles and clippings',
  recipe: 'recipes',
  'video-log': 'transcripts of video diary entries',
  person: 'people you know',
  goal: 'goals and bucket-list items',
  subscription: 'subscriptions with a renewal date',
  account: 'bank or savings accounts',
  expense: 'purchases and spending'
}

/** The types soii has a property table for, in docs/frontmatter.md order, each with what it is for. */
export const TYPE_CHOICES: { type: string; hint: string }[] = Object.keys(TYPE_FIELDS).map(type => ({ type, hint: HINTS[type] ?? '' }))
