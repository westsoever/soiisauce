// app/vault/compile.ts
// The vault compiler (spec §7): config → walk → parse (pass 1) → render with
// link resolution (pass 2) → backlinks, folders, attachments, search → disk.
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { parse } from 'yaml'
import { ConfigError } from '../lib/config-schema'
import { resolveConfig } from '../lib/merge-config'
import { fileUrl } from '../lib/paths'
import type { SearchDoc } from '../lib/search-options'
import type { FolderNode, Frontmatter, Heading, NoteDoc, NoteMeta, SoiiConfig, VaultIndex } from '../lib/types'
import { copyAttachments, fileSizes } from './attachments'
import { deriveFields, isHiddenYaml, parseFrontmatter, splitFrontmatter } from './frontmatter'
import { createLinkResolver, type LinkResolver } from './links'
import { computeLastSeen } from '../lib/people'
import { renderMarkdown, scanMarkdown, stripComments } from './markdown'
import { writeOutput } from './output'
import { buildSearchIndex } from './search-index'
import { walkVault } from './walk'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024
const IMAGE_FIELDS = ['cover', 'image', 'poster', 'thumbnail']

export function loadConfig(vaultDir: string): SoiiConfig {
  for (const name of ['soii.config.yml', 'soii.config.yaml']) {
    const file = join(vaultDir, name)
    if (!existsSync(file)) continue
    let raw: unknown
    try {
      raw = parse(readFileSync(file, 'utf8'))
    } catch (err) {
      throw new ConfigError([`soii.config.yml: not valid YAML: ${(err as Error).message.split('\n')[0]}`])
    }
    return resolveConfig(raw)
  }
  return resolveConfig({})
}

function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    for (const item of v.flat(Infinity)) if (typeof item === 'string') return item
  }
  return null
}

/** NoteMeta.image from cover/image/poster/thumbnail (spec §8.4). */
export function resolveImage(
  fm: Frontmatter,
  fromPath: string,
  resolve: LinkResolver,
  isNote: (path: string) => boolean,
  tooLarge: Set<string>,
  referenced: Set<string>
): string | null {
  for (const field of IMAGE_FIELDS) {
    const value = firstString(fm[field])?.trim()
    if (!value) continue
    if (/^https?:\/\//i.test(value)) return value
    const target = value.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim()
    const resolved = resolve(target, fromPath)
    if (resolved && !isNote(resolved) && !tooLarge.has(resolved)) {
      referenced.add(resolved)
      return fileUrl(resolved)
    }
  }
  return null
}

export function buildFolderTree(notes: NoteMeta[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], notes: [] }
  for (const note of notes) {
    let node = root
    if (note.folder) {
      for (const part of note.folder.split('/')) {
        const path = node.path ? `${node.path}/${part}` : part
        let child = node.folders.find(f => f.name === part)
        if (!child) {
          child = { name: part, path, folders: [], notes: [] }
          node.folders.push(child)
        }
        node = child
      }
    }
    node.notes.push(note.id)
  }
  const sortTree = (n: FolderNode) => {
    n.folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    n.folders.forEach(sortTree)
  }
  sortTree(root)
  return root
}

function gitHead(dir: string): string | null {
  const r = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: dir, stdout: 'pipe', stderr: 'ignore' })
  return r.success ? r.stdout.toString().trim() : null
}

interface Draft {
  meta: NoteMeta
  body: string
  headings: Heading[]
  plainText: string
}

export async function compileVault(opts: {
  vaultDir: string
  outDir: string
  maxFileBytes?: number
  /** Obsidian vault name when soii.config.yml doesn't set one (build.ts guesses it from the env). */
  vaultName?: string | null
}): Promise<{ index: VaultIndex; warnings: string[] }> {
  const warnings: string[] = []
  const config = loadConfig(opts.vaultDir)
  config.obsidianVault ??= opts.vaultName ?? posix.basename(opts.vaultDir.replace(/\\/g, '/'))
  const { markdown, attachments, fsPaths, warnings: walkWarnings } = walkVault(opts.vaultDir, config.exclude)
  warnings.push(...walkWarnings)
  const maxBytes = opts.maxFileBytes ?? MAX_FILE_BYTES
  const sizes = fileSizes(opts.vaultDir, attachments, fsPaths)
  const tooLarge = new Set(attachments.filter(p => (sizes.get(p) ?? 0) > maxBytes))
  for (const p of tooLarge) {
    warnings.push(`${p}: skipped, ${((sizes.get(p) ?? 0) / 1024 / 1024).toFixed(1)} MB is over the ${(maxBytes / 1024 / 1024).toFixed(1)} MB limit`)
  }

  // Pass 1: frontmatter + titles/excerpts, so embeds and links can use them.
  const drafts: Draft[] = []
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  for (const path of markdown) {
    const source = readFileSync(join(opts.vaultDir, fsPaths.get(path) ?? path), 'utf8')
    const parsed = parseFrontmatter(source)
    if (parsed.error) {
      warnings.push(`${path}: ${parsed.error}`)
      if (isHiddenYaml(splitFrontmatter(source).yaml ?? '')) {
        warnings.push(`${path}: skipped, it is marked hidden but its frontmatter can't be read`)
        continue
      }
    }
    const fields = deriveFields(parsed.data, path, config.types)
    if (fields.hidden) continue
    const scan = scanMarkdown(parsed.body)
    const id = path.replace(/\.md$/i, '')
    const dir = posix.dirname(path)
    drafts.push({
      body: parsed.body,
      headings: scan.headings,
      plainText: scan.plainText,
      meta: {
        id,
        title: fields.title ?? scan.firstH1 ?? posix.basename(id),
        path,
        folder: dir === '.' ? '' : dir,
        type: fields.type,
        tags: fields.tags,
        date: fields.date,
        updated: fields.updated,
        frontmatter: parsed.data,
        excerpt: scan.plainText.slice(0, 200),
        image: null,
        wordCount: scan.plainText ? scan.plainText.split(' ').length : 0,
        noteWords: scan.noteWords,
        // People overview: the body isn't shipped to the browser, so the last interaction is found here.
        ...(fields.type === 'person' ? { lastSeen: computeLastSeen(parsed.data, stripComments(parsed.body), today) } : {})
      }
    })
  }

  const byPath = new Map(drafts.map(d => [d.meta.path, d]))
  const resolve = createLinkResolver([...byPath.keys(), ...attachments])
  const noteInfo = (p: string) => {
    const d = byPath.get(p)
    return d ? { id: d.meta.id, title: d.meta.title, excerpt: d.meta.excerpt } : null
  }
  const referenced = new Set<string>()
  for (const d of drafts) {
    d.meta.image = resolveImage(d.meta.frontmatter, d.meta.path, resolve, p => byPath.has(p), tooLarge, referenced)
  }

  // Pass 2: render with link resolution.
  const missing: string[] = []
  const docs: NoteDoc[] = drafts.map(d => {
    const r = renderMarkdown(d.body, { fromPath: d.meta.path, resolve, noteInfo, tooLarge: p => tooLarge.has(p) })
    for (const a of r.attachments) referenced.add(a)
    for (const target of r.missing) missing.push(`${d.meta.path}: [[${target}]]`)
    d.meta.tags = [...new Set([...d.meta.tags, ...r.tags])].sort()
    return { ...d.meta, html: r.html, headings: d.headings, outgoing: r.outgoing.filter(id => id !== d.meta.id), backlinks: [] }
  })

  const byId = new Map(docs.map(d => [d.id, d]))
  for (const d of docs) for (const target of d.outgoing) byId.get(target)?.backlinks.push(d.id)
  for (const d of docs) {
    d.backlinks = [...new Set(d.backlinks)].sort((a, b) => (byId.get(a)?.title ?? a).localeCompare(byId.get(b)?.title ?? b))
  }

  if (missing.length) {
    warnings.push(`${missing.length} wikilinks point to notes that don't exist${missing.length > 20 ? ' (first 20 listed)' : ''}:`)
    for (const line of missing.slice(0, 20)) warnings.push(`  ${line}`)
  }
  const totalBytes = [...referenced].reduce((sum, p) => sum + (sizes.get(p) ?? 0), 0)
  if (totalBytes > MAX_TOTAL_BYTES) {
    warnings.push(`attachments total ${(totalBytes / 1024 / 1024).toFixed(0)} MB, over the 200 MB guideline — deploys may get slow`)
  }

  const notes: NoteMeta[] = docs.map(({ html: _h, headings: _hd, outgoing: _o, backlinks: _b, ...meta }) => meta)
  const index: VaultIndex = {
    vaultCommit: gitHead(opts.vaultDir),
    builtAt: new Date().toISOString(),
    config,
    notes,
    folders: buildFolderTree(notes),
    warnings
  }
  const searchDocs: SearchDoc[] = drafts.map(d => ({
    id: d.meta.id,
    title: d.meta.title,
    path: d.meta.path,
    headings: d.headings.map(h => h.text).join(' '),
    tags: d.meta.tags.join(' '),
    text: d.plainText,
    snippetText: d.plainText.slice(0, 2000)
  }))
  writeOutput(opts.outDir, {
    index,
    docs,
    searchJson: buildSearchIndex(searchDocs),
    meta: { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? gitHead(process.cwd()), vaultCommit: index.vaultCommit, builtAt: index.builtAt }
  })
  copyAttachments(opts.vaultDir, opts.outDir, referenced, fsPaths)
  return { index, warnings }
}
