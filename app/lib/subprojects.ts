// Subprojects: a project note whose `parent` is a [[link]] to another note is a subproject of it.
// Pure rules shared by the reader (breadcrumb, subproject list) and the vault checker (broken
// and circular parents). A parent may itself have a parent; the walk stops at a repeat, so a
// loop can't hang the page.
import { linkValue } from './board'
import type { Frontmatter } from './types'

export interface ProjectNode {
  id: string
  type?: string | null
  frontmatter: Frontmatter
}

/** The note whose id is `name` or ends in `/name` (shortest id first), as a [[wikilink]] would resolve. */
export function findNote<T extends { id: string }>(notes: T[], name: string): T | undefined {
  const key = name.trim().toLowerCase().replace(/\.md$/, '')
  return notes
    .filter(n => n.id.toLowerCase() === key || n.id.toLowerCase().endsWith(`/${key}`))
    .sort((a, b) => a.id.length - b.id.length)[0]
}

/** The name `parent` points at: `"[[Balcony garden]]"`, `"[[Balcony garden|the big one]]"`, unquoted `[[Balcony garden]]` or plain `Balcony garden`. Null when empty or a URL. */
export function parentName(frontmatter: Frontmatter): string | null {
  const link = linkValue(frontmatter.parent, 'Parent')
  if (!link || link.kind === 'url') return null
  return link.kind === 'note' ? link.target : link.label
}

/** The note `note.parent` resolves to, or undefined when it has no parent or the parent isn't in `notes`. */
export function parentOf<T extends ProjectNode>(note: ProjectNode, notes: T[]): T | undefined {
  const name = parentName(note.frontmatter)
  return name === null ? undefined : findNote(notes, name)
}

/** The parents of `note`, nearest first. `cycle` is true when the walk comes back to `note` itself. */
export function ancestors<T extends ProjectNode>(note: ProjectNode, notes: T[]): { chain: T[]; cycle: boolean } {
  const chain: T[] = []
  const seen = new Set([note.id])
  for (let next = parentOf(note, notes); next; next = parentOf(next, notes)) {
    if (next.id === note.id) return { chain, cycle: true }
    if (seen.has(next.id)) break
    seen.add(next.id)
    chain.push(next)
  }
  return { chain, cycle: false }
}

const isDone = (note: ProjectNode) => String(note.frontmatter.status ?? '').trim().toLowerCase() === 'done'

/** Every parent project's id → its subprojects: open ones first, then done ones, each by title. */
export function subprojectMap<T extends ProjectNode & { title: string }>(notes: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const n of notes) {
    if (n.type !== 'project') continue
    const parent = parentOf(n, notes)
    if (parent && parent.id !== n.id) map.set(parent.id, [...(map.get(parent.id) ?? []), n])
  }
  for (const list of map.values()) list.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || a.title.localeCompare(b.title))
  return map
}

/** The projects whose `parent` is `note`. */
export const subprojectsOf = <T extends ProjectNode & { title: string }>(note: ProjectNode, notes: T[]): T[] => subprojectMap(notes).get(note.id) ?? []

/** How many of `subprojects` have `status: done`. */
export function doneCount(subprojects: ProjectNode[]): number {
  return subprojects.filter(isDone).length
}
