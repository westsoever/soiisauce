// app/vault/walk.ts
// Lists a vault's notes, LaTeX sources and attachments (spec §7.1): skips dot-entries,
// node_modules, symlinks and config.exclude globs. Paths are vault-relative,
// "/"-separated, NFC-normalised (macOS may store NFD names) and sorted;
// fsPaths maps each back to the on-disk spelling.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { matchesGlob } from '../lib/glob'

export const ATTACHMENT_EXT = /\.(png|jpe?g|gif|webp|avif|svg|pdf|mp3|m4a|mp4|webm)$/i

export interface WalkResult {
  markdown: string[]
  attachments: string[]
  tex: string[]
  fsPaths: Map<string, string>
  warnings: string[]
}

/** A file found on disk: `path` is the NFC vault path, `onDisk` the spelling the filesystem uses. */
export interface Found {
  path: string
  onDisk: string
}

const noteId = (path: string) => path.replace(/\.md$/i, '')

// Sorts, classifies and de-duplicates what the walk found. Two files that end up with the
// same note id (`Dup.md` + `Dup.MD`) or the same normalised path (NFC vs NFD spellings)
// would overwrite each other's output, so the first by sorted path wins and the rest warn.
export function collectWalk(found: Found[]): WalkResult {
  const markdown: string[] = []
  const attachments: string[] = []
  const tex: string[] = []
  const fsPaths = new Map<string, string>()
  const warnings: string[] = []
  const owners = new Map<string, string>()
  const sorted = [...found].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.onDisk < b.onDisk ? -1 : a.onDisk > b.onDisk ? 1 : 0))
  for (const { path, onDisk } of sorted) {
    const isNote = /\.md$/i.test(path)
    const isTex = /\.tex$/i.test(path)
    if (!isNote && !isTex && !ATTACHMENT_EXT.test(path)) continue
    const key = isNote ? `note:${noteId(path)}` : isTex ? `tex:${path}` : `file:${path}`
    const owner = owners.get(key)
    if (owner !== undefined) {
      warnings.push(isNote ? `${path}: skipped, ${owner} already has the note id "${noteId(owner)}"` : `${path}: skipped, a file with the same normalised path was already found`)
      continue
    }
    owners.set(key, path)
    ;(isNote ? markdown : isTex ? tex : attachments).push(path)
    fsPaths.set(path, onDisk)
  }
  return { markdown, attachments, tex, fsPaths, warnings }
}

// A pattern whose last segment has no `*` or `?` names a folder (`Private`, `**/Private`), so it
// excludes that folder as well as files. Wildcard-last patterns (`*`, `*.md`, `**/_*`) match files
// only; write `Priv*/**` to drop folders. `Private/` and `Private/**` match the folder through `path/`.
const namesFolder = (pattern: string) => !/[*?]/.test(pattern.split('/').filter(Boolean).pop() ?? '*')

export function walkVault(vaultDir: string, exclude: string[]): WalkResult {
  const folderNames = exclude.filter(namesFolder)
  const found: Found[] = []
  const visit = (rel: string) => {
    for (const entry of readdirSync(join(vaultDir, rel), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue
      const onDisk = rel ? `${rel}/${entry.name}` : entry.name
      const path = onDisk.normalize('NFC')
      if (entry.isDirectory()) {
        if (!exclude.length || !(matchesGlob(`${path}/`, exclude) || matchesGlob(path, folderNames))) visit(onDisk)
        continue
      }
      if (!entry.isFile() || (exclude.length && matchesGlob(path, exclude))) continue
      found.push({ path, onDisk })
    }
  }
  visit('')
  return collectWalk(found)
}
