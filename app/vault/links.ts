// app/vault/links.ts
// Resolves [[wikilinks]] and relative markdown links like Obsidian does
// (spec §7.3): exact path, then relative to the linking note, then
// case-insensitive basename/suffix with the shortest path winning.
import { posix } from 'node:path'

export type LinkResolver = (target: string, fromPath: string) => string | null

const stripMd = (p: string) => p.replace(/\.md$/i, '')
const nameKey = (p: string) => stripMd(posix.basename(p)).toLowerCase()

export function createLinkResolver(paths: string[]): LinkResolver {
  const exact = new Set(paths)
  const lower = new Map<string, string>()
  const byName = new Map<string, string[]>()
  for (const p of [...paths].sort()) {
    if (!lower.has(p.toLowerCase())) lower.set(p.toLowerCase(), p)
    const key = nameKey(p)
    byName.set(key, [...(byName.get(key) ?? []), p])
  }

  return (rawTarget, fromPath) => {
    const target = rawTarget.normalize('NFC').trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!target) return null
    const tries = [target, `${target}.md`]
    for (const t of tries) if (exact.has(t)) return t
    const dir = posix.dirname(fromPath)
    for (const t of tries) {
      const rel = posix.normalize(dir === '.' ? t : `${dir}/${t}`)
      if (!rel.startsWith('..') && exact.has(rel)) return rel
    }
    for (const t of tries) {
      const hit = lower.get(t.toLowerCase())
      if (hit) return hit
    }
    const suffix = stripMd(target).toLowerCase()
    const candidates = (byName.get(nameKey(target)) ?? []).filter(p => {
      const s = stripMd(p).toLowerCase()
      return s === suffix || s.endsWith(`/${suffix}`)
    })
    if (candidates.length === 0) return null
    return candidates.sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
  }
}

export function parseWikiTarget(inner: string): { target: string; heading: string | null; alias: string | null } {
  const bar = inner.indexOf('|')
  const left = bar >= 0 ? inner.slice(0, bar) : inner
  const alias = bar >= 0 ? inner.slice(bar + 1).trim() || null : null
  const hash = left.indexOf('#')
  const target = (hash >= 0 ? left.slice(0, hash) : left).trim()
  let heading = hash >= 0 ? left.slice(hash + 1).trim() || null : null
  if (heading?.startsWith('^')) heading = null // block reference: link to the note itself
  return { target, heading, alias }
}
