// The contracts every part of soii shares (spec §6). Plans 2–4 are written
// against these exact names — rename nothing.

export type NoteId = string
export type Frontmatter = Record<string, unknown>

export interface NoteMeta {
  id: NoteId
  title: string
  path: string
  folder: string
  type: string | null
  tags: string[]
  date: string | null
  updated: string | null
  frontmatter: Frontmatter
  excerpt: string
  image: string | null
  wordCount: number
  /** Body words outside every heading (compile time). Missing on older builds: read it as 0. */
  noteWords?: number
  /** Person notes only: newest of an ISO `last_contact` and the dated list items in the body (YYYY-MM-DD). */
  lastSeen?: string | null
}

export interface Heading {
  depth: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  slug: string
}

export interface NoteDoc extends NoteMeta {
  html: string
  headings: Heading[]
  outgoing: NoteId[]
  backlinks: NoteId[]
}

export interface FolderNode {
  name: string
  path: string
  folders: FolderNode[]
  notes: NoteId[]
}

export interface VaultIndex {
  vaultCommit: string | null
  builtAt: string
  config: SoiiConfig
  notes: NoteMeta[]
  folders: FolderNode
  warnings: string[]
}

export type Scalar = string | number | boolean

export interface QueryClause {
  type?: string | string[]
  path?: string | string[]
  tag?: string | string[]
  where?: Record<string, Scalar | Scalar[]>
}

export type Query = QueryClause | QueryClause[]

export interface SortKey {
  field: string
  dir: 'asc' | 'desc'
}

export const VIEW_NAMES = ['list', 'table', 'gallery', 'board', 'stats', 'feed', 'pulse'] as const
export type ViewName = (typeof VIEW_NAMES)[number]

export interface TabConfig {
  id: string
  title: string
  icon?: string
  view: ViewName
  query: Query
  sort?: SortKey[]
  limit?: number
  options?: Record<string, unknown>
}

export interface WorkspaceTheme {
  font?: string
  accent?: string
  radius?: string
}

export interface WorkspaceConfig {
  id: string
  title: string
  icon?: string
  theme?: WorkspaceTheme
  tabs: TabConfig[]
}

export interface SoiiConfig {
  title: string
  home: string
  exclude: string[]
  types: Record<string, string[]>
  workspaces: WorkspaceConfig[]
  /** Obsidian vault name for "Open in Obsidian". Set by soii.config.yml, else guessed at build time. */
  obsidianVault?: string
}

export interface ViewProps {
  workspace: WorkspaceConfig
  tab: TabConfig
  notes: NoteMeta[]
  index: VaultIndex
  openNote: (id: NoteId) => void
}

export interface DecorateCtx {
  secret: string
  origin: string
}

export type NoteDecorator = (note: NoteMeta, ctx: DecorateCtx) => NoteMeta

export interface Me {
  login: string
  avatarUrl: string | null
}

export interface SearchResult {
  id: NoteId
  title: string
  path: string
  snippet: string
  score: number
}

export interface BuildMeta {
  commit: string | null
  vaultCommit: string | null
  builtAt: string
}
