// app/lib/search-options.ts
// MiniSearch settings shared by the compiler (which builds search.json) and the
// server (which loads it). Both sides must use the same options.
import type { Options } from 'minisearch'

export interface SearchDoc {
  id: string
  title: string
  path: string
  headings: string
  tags: string
  text: string
  snippetText: string
}

export const SEARCH_OPTIONS: Options<SearchDoc> = {
  fields: ['title', 'headings', 'tags', 'text'],
  storeFields: ['title', 'path', 'snippetText'],
  searchOptions: { boost: { title: 3, headings: 2, tags: 2 }, prefix: true, fuzzy: 0.2 }
}
