// app/vault/search-index.ts
// Builds search.json (spec §7.4) with the options the server loads it with.
import MiniSearch from 'minisearch'
import { SEARCH_OPTIONS, type SearchDoc } from '../lib/search-options'

export function buildSearchIndex(docs: SearchDoc[]): string {
  const index = new MiniSearch<SearchDoc>(SEARCH_OPTIONS)
  index.addAll(docs)
  return JSON.stringify(index)
}
