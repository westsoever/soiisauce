// The properties each type is documented to have (docs/frontmatter.md, "Fields per type"), in the
// order that table lists them. The checker's missing-field rule and /soii-setup both read this, and
// type-fields.test.ts fails if it drifts from the doc. `title` is left out on purpose: soii takes
// it from the file name, so a note is never "missing" it.
const FILING = ['collection', 'category']
const BOOK = ['author', 'cover', 'isbn', 'status', 'rating', 'started', 'finished', ...FILING]
const FILM = ['director', 'year', 'cover', 'status', 'rating', 'watched', ...FILING]

export const TYPE_FIELDS: Record<string, string[]> = {
  book: BOOK,
  audiobook: [...BOOK, 'narrator'],
  movie: FILM,
  documentary: FILM,
  video: ['url', 'channel', 'cover', 'watched', ...FILING],
  research: ['authors', 'year', 'venue', 'url', 'doi', 'arxiv', 'status', ...FILING],
  article: ['url', 'author', ...FILING],
  recipe: ['image', 'description', 'source', ...FILING],
  'video-log': ['date', 'video'],
  person: ['relationship', 'company', 'role', 'email', 'phone', 'location', 'last_contact', 'birthday', 'linkedin', 'cadence', 'circle'],
  goal: ['horizon', 'year', 'status', 'area', 'due', 'progress'],
  subscription: ['price', 'currency', 'cycle', 'renews', 'status'],
  account: ['institution', 'balance', 'currency', 'as_of'],
  expense: ['amount', 'currency', 'category', 'date', 'paid_with']
}

/** The documented fields for a canonical type; empty for types without a table (project, daily, custom ones). */
export const expectedFields = (type: string): string[] => TYPE_FIELDS[type] ?? []
