// Full-text search over the compiled search.json (spec §7.4) with a short
// snippet around the first matched term.
import MiniSearch from 'minisearch'
import { SEARCH_OPTIONS, type SearchDoc } from '../lib/search-options'
import type { SearchResult } from '../lib/types'

export function snippet(text: string, terms: string[], width = 140): string {
  const lower = text.toLowerCase()
  const hits = terms.map(t => lower.indexOf(t.toLowerCase())).filter(i => i >= 0)
  if (hits.length === 0) return text.length > width ? `${text.slice(0, width).trim()}…` : text
  const start = Math.max(0, Math.min(...hits) - 40)
  const end = Math.min(text.length, start + width)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

export function createSearcher(json: string): { search(q: string, limit: number): SearchResult[] } {
  const index = MiniSearch.loadJSON<SearchDoc>(json, SEARCH_OPTIONS)
  return {
    search(q, limit) {
      const query = q.trim()
      if (!query) return []
      return index
        .search(query)
        .slice(0, limit)
        .map(r => ({
          id: String(r.id),
          title: String(r.title),
          path: String(r.path),
          snippet: snippet(String(r.snippetText ?? ''), r.terms),
          score: Math.round(r.score * 100) / 100
        }))
    }
  }
}
