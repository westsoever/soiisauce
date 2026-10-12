// Reads the compiled vault (spec §8.2): index and search load once per function
// instance; notes load on demand through a 200-entry LRU; files are served only
// if they're in the compiled attachment set.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { noteFileName } from '../lib/note-file'
import type { BuildMeta, NoteDoc, NoteId, SearchResult, VaultIndex } from '../lib/types'
import { createSearcher } from './search'

export class VaultNotBuiltError extends Error {
  constructor(dir: string) {
    super(`No compiled vault in ${dir}. Run \`bun run build\`.`)
    this.name = 'VaultNotBuiltError'
  }
}

export interface VaultStore {
  meta(): BuildMeta | null
  index(): VaultIndex
  note(id: NoteId): NoteDoc | null
  search(q: string, limit: number): SearchResult[]
  filePath(path: string): string | null
}

export function defaultGeneratedDir(env: Record<string, string | undefined> = process.env): string {
  return env.SOII_GENERATED_DIR ?? join(process.cwd(), 'api', '_generated', 'vault')
}

function listFiles(root: string): Set<string> {
  const out = new Set<string>()
  const walk = (rel: string) => {
    const dir = join(root, rel)
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) out.add(path)
    }
  }
  walk('')
  return out
}

export function createVaultStore(dir: string): VaultStore {
  let index: VaultIndex | null = null
  let ids: Set<string> | null = null
  let searcher: ReturnType<typeof createSearcher> | null = null
  let files: Set<string> | null = null
  const cache = new Map<string, NoteDoc>()

  const loadIndex = (): VaultIndex => {
    if (!index) {
      const file = join(dir, 'index.json')
      if (!existsSync(file)) throw new VaultNotBuiltError(dir)
      index = JSON.parse(readFileSync(file, 'utf8')) as VaultIndex
      ids = new Set(index.notes.map(n => n.id))
    }
    return index
  }

  return {
    meta() {
      try {
        return JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as BuildMeta
      } catch {
        return null
      }
    },
    index: loadIndex,
    note(id) {
      loadIndex()
      if (!ids?.has(id)) return null
      const hit = cache.get(id)
      if (hit) {
        cache.delete(id)
        cache.set(id, hit)
        return hit
      }
      const doc = JSON.parse(readFileSync(join(dir, 'notes', noteFileName(id)), 'utf8')) as NoteDoc
      cache.set(id, doc)
      if (cache.size > 200) cache.delete(cache.keys().next().value as string)
      return doc
    },
    search(q, limit) {
      loadIndex()
      searcher ??= createSearcher(readFileSync(join(dir, 'search.json'), 'utf8'))
      return searcher.search(q, limit)
    },
    filePath(path) {
      files ??= listFiles(join(dir, 'files'))
      return files.has(path) ? join(dir, 'files', path) : null
    }
  }
}
