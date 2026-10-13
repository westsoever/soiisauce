// app/lib/log.ts
// The Log (see the design notes): what you can log, which fields each
// kind asks for, and the markdown a log turns into. Pure and client-safe (no yaml import): the
// browser uses it for the form and for Copy, the server to rebuild the file it commits.
import { LIST_FIELDS } from './collections'
import { fileNameFor, NEW_NOTE_SPECS, yamlString, type NoteField } from './new-note'

export type LogFieldKind = 'text' | 'number' | 'date' | 'select' | 'rating' | 'list'

export interface LogField {
  key: string
  label: string
  kind: LogFieldKind
  options?: string[]
  /** Chip text per option when it differs from the stored value (DKK → "kr."). */
  labels?: Record<string, string>
  placeholder?: string
  /** Asked only when creating a note, never patched onto an existing one. */
  newOnly?: boolean
}

export interface LogKind {
  id: string
  label: string
  /** Canonical frontmatter type it targets and creates; null = any note (Log → Note). */
  type: string | null
  /** Folder for new notes; null = this kind can't create one itself (see newAs). */
  folder: string | null
  /** Appends go at the end of this `## ` section; null = always a new note. */
  section: string | null
  quick: LogField[]
  more: LogField[]
  /** Prefilled when creating a note. */
  defaults: Record<string, string>
  /** A new target is created as this other kind (Conversation → Person). */
  newAs?: string
  /** Chips for how a conversation happened, written as `(how)` in the entry. */
  howOptions?: string[]
  /** Listed under "More" in the picker. */
  secondary?: boolean
  placeholder: string
}

export const PEOPLE_SECTION = 'Notes & dated interactions'
/** Contact-card sections that stay last: a missing notes section goes in before them. */
export const PERSON_TAIL = ['Identity / ambiguity flags', 'Sources']

const RELATIONSHIPS = ['friend', 'family', 'partner', 'mentor', 'investor', 'contact']

/** The Relationship choices: the generic ones, then the values the vault's person notes already use, most used first. */
export function relationshipOptions(notes: { type: string | null; frontmatter: Record<string, unknown> }[]): string[] {
  const counts = new Map<string, number>()
  for (const note of notes) {
    if (note.type !== 'person') continue
    const raw = note.frontmatter.relationship
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
      if (v && !RELATIONSHIPS.includes(v)) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
  }
  const own = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v)
  return [...RELATIONSHIPS, ...own]
}

const text = (key: string, label: string, placeholder?: string): LogField => ({ key, label, kind: 'text', placeholder })
const select = (key: string, label: string, options: string[], labels?: Record<string, string>): LogField => ({ key, label, kind: 'select', options, labels })

function fromNoteField(f: NoteField): LogField {
  if (f.key === 'rating') return { key: 'rating', label: 'Rating', kind: 'rating' }
  return { key: f.key, label: f.label, kind: f.kind ?? 'text', options: f.options, placeholder: f.placeholder }
}

// Library kinds reuse the "Add" specs: status, rating, collection and category are quick (shown first, patched on append), the rest is "More details".
function libraryKind(type: string, label: string, placeholder: string, secondary = false): LogKind {
  const spec = NEW_NOTE_SPECS[type]
  const fields = spec.fields.filter(f => f.key !== 'title').map(fromNoteField)
  const isQuick = (f: LogField) => f.kind === 'select' || f.kind === 'rating'
  return {
    id: type,
    label,
    type,
    folder: spec.folder,
    section: 'Log',
    quick: [...fields.filter(isQuick), ...LIST_FIELDS.map(f => ({ key: f.key, label: f.label, kind: 'list' as const }))],
    more: fields.filter(f => !isQuick(f)),
    defaults: spec.defaults ?? {},
    secondary,
    placeholder
  }
}

const PERSON: LogKind = {
  id: 'person',
  label: 'Person',
  type: 'person',
  folder: '05-Knowledge/People',
  section: PEOPLE_SECTION,
  quick: [select('relationship', 'Relationship', RELATIONSHIPS)],
  more: [
    text('company', 'Company'),
    text('role', 'Role'),
    text('location', 'Location'),
    text('email', 'Email'),
    text('phone', 'Phone'),
    text('linkedin', 'LinkedIn'),
    { key: 'birthday', label: 'Birthday', kind: 'date' }
  ],
  defaults: {},
  placeholder: 'How do you know them?'
}

export const LOG_KINDS: LogKind[] = [
  {
    id: 'conversation',
    label: 'Conversation',
    type: 'person',
    folder: null,
    section: PEOPLE_SECTION,
    quick: [],
    more: [],
    defaults: {},
    newAs: 'person',
    howOptions: ['met', 'call', 'text'],
    placeholder: 'What did you talk about?'
  },
  PERSON,
  libraryKind('book', 'Book', 'Thoughts, quotes, where you are…'),
  libraryKind('movie', 'Movie', 'What did you think?'),
  {
    id: 'goal',
    label: 'Goal',
    type: 'goal',
    folder: '03-Areas/Goals',
    section: 'Log',
    quick: [select('horizon', 'Horizon', ['year', 'life', 'bucket']), select('status', 'Status', ['idea', 'active', 'done', 'dropped'])],
    more: [text('area', 'Area'), { key: 'year', label: 'Year', kind: 'number' }, { key: 'due', label: 'Due', kind: 'date' }, { key: 'progress', label: 'Progress (0–100)', kind: 'number' }],
    defaults: { horizon: 'year', status: 'active' },
    placeholder: 'Why it matters, the next step…'
  },
  {
    id: 'expense',
    label: 'Expense',
    type: 'expense',
    folder: '03-Areas/Finance/Expenses',
    section: null,
    quick: [
      { key: 'amount', label: 'Amount', kind: 'number', placeholder: '0' },
      select('currency', 'Currency', ['DKK', 'EUR'], { DKK: 'kr.', EUR: '€' }),
      select('category', 'Category', ['food', 'transport', 'home', 'fun', 'health', 'work', 'other'])
    ],
    more: [text('paid_with', 'Paid with')],
    defaults: { currency: 'DKK' },
    placeholder: 'Anything to remember about it?'
  },
  {
    id: 'note',
    label: 'Note',
    type: null,
    folder: '00-Inbox',
    section: 'Log',
    quick: [{ key: 'tags', label: 'Tags', kind: 'text', placeholder: 'comma, separated', newOnly: true }],
    more: [],
    defaults: {},
    placeholder: 'Write it down…'
  },
  libraryKind('audiobook', 'Audiobook', 'Thoughts, where you are…', true),
  libraryKind('documentary', 'Documentary', 'What did you think?', true),
  libraryKind('video', 'Video', 'What was it about?', true),
  libraryKind('article', 'Article', 'The gist, a quote…', true),
  libraryKind('research', 'Paper', 'Key findings…', true)
]

const BY_ID = new Map(LOG_KINDS.map(k => [k.id, k]))

export function kindById(id: string): LogKind | null {
  return BY_ID.get(id) ?? null
}

/** The kind whose folder and fields a new note uses: a Conversation with someone new creates a Person. */
export function creatingKind(kind: LogKind): LogKind {
  return kind.newAs ? (kindById(kind.newAs) ?? kind) : kind
}

/** Fields a request may set: everything when creating, quick fields (minus new-only) when appending. */
export function fieldsFor(kind: LogKind, mode: 'new' | 'append'): LogField[] {
  if (mode === 'new') {
    const k = creatingKind(kind)
    return [...k.quick, ...k.more]
  }
  return kind.quick.filter(f => !f.newOnly)
}

/** YYYY-MM-DD in the browser's (or server's) own time zone, so a late-evening log keeps its day. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 12, 12.5 and the Danish 120,50; anything else (thousands separators included) is not a number. */
export function numberValue(raw: string): number | null {
  const t = raw.trim()
  return /^-?\d+(?:[.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : null
}

/** Finishing a book or watching a film fills that date with the log date, unless it's already set. */
export function autoDates(kind: LogKind, values: Record<string, string>, date: string, existing: Record<string, unknown> = {}): Record<string, string> {
  const out = { ...values }
  const keys = new Set([...kind.quick, ...kind.more].map(f => f.key))
  for (const field of ['finished', 'watched']) {
    if (out.status === field && keys.has(field) && !out[field] && !existing[field]) out[field] = date
  }
  return out
}

/** One dated bullet. Extra lines are indented under it, so they stay part of the same list item. */
export function formatEntry(input: { date: string; text: string; how?: string | null; changes?: Record<string, string> }): string {
  const lines = input.text.replace(/\r\n?/g, '\n').trim().split('\n').map(l => l.trimEnd())
  const summary = Object.entries(input.changes ?? {})
    .map(([k, v]) => `${k} → ${v}`)
    .join(', ')
  const first = lines[0] || summary
  const head = `- ${input.date}${input.how ? ` (${input.how})` : ''} — ${first}`
  const rest = lines[0] ? lines.slice(1).map(l => (l ? `  ${l}` : '')) : []
  return [head, ...rest].join('\n')
}

export interface NewLogInput {
  kind: LogKind
  title: string
  values: Record<string, string>
  text: string
  date: string
  how?: string | null
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
const flowItem = (s: string) => (/[[\]{},]/.test(s) ? JSON.stringify(s) : yamlString(s))
const yamlList = (items: string[]) => `[${items.map(flowItem).join(', ')}]`
const splitTags = (raw: string) =>
  raw
    .split(',')
    .map(t => collapse(t).replace(/^#/, ''))
    .filter(Boolean)

function yamlField(field: LogField, raw: string): string {
  if (field.kind === 'number' || field.kind === 'rating') {
    const n = numberValue(raw)
    if (n !== null) return String(field.kind === 'rating' ? Math.round(n) : n)
  }
  if (field.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return yamlString(raw)
}

function personBody(title: string, input: NewLogInput, text: string): string {
  const entry = text ? `${formatEntry({ date: input.date, text, how: input.how })}\n\n` : ''
  return `# ${title}\n\n## Who they are\n\n## ${PEOPLE_SECTION}\n\n${entry}## Sources\n\n- soii log, ${input.date}\n`
}

/** The file a new log creates. Values are one line each, so nothing typed can add frontmatter keys. */
export function buildNewNote(input: NewLogInput): { path: string; content: string; title: string } {
  const kind = creatingKind(input.kind)
  const values = autoDates(kind, input.values, input.date)
  const title = collapse(input.title) || (kind.id === 'expense' ? collapse(values.category ?? '') || 'Expense' : 'Untitled')
  const fm: string[] = []
  if (kind.type) fm.push(`type: ${kind.type}`)
  for (const field of [...kind.quick, ...kind.more]) {
    const raw = collapse(values[field.key] ?? '')
    if (!raw || field.kind === 'list') continue
    fm.push(field.key === 'tags' ? `tags: ${yamlList(splitTags(raw))}` : `${field.key}: ${yamlField(field, raw)}`)
  }
  // Collection and category as block lists, the Library's own style (new-note.ts buildNote).
  for (const field of [...kind.quick, ...kind.more]) {
    if (field.kind !== 'list') continue
    const items = (values[field.key] ?? '').split(',').map(collapse).filter(Boolean)
    if (items.length) fm.push(`${field.key}:`, ...items.map(item => `  - ${yamlString(item)}`))
  }
  if (kind.id === 'person') {
    const relationship = collapse(values.relationship ?? '')
    fm.push(`tags: ${yamlList(['people', ...(relationship ? [relationship] : [])])}`, `created: ${input.date}`, `updated: ${input.date}`)
  } else if (kind.id === 'expense') {
    fm.push(`date: ${input.date}`)
  } else {
    fm.push(`created: ${input.date}`)
  }
  const text = input.text.replace(/\r\n?/g, '\n').trim()
  const body = kind.id === 'person' ? personBody(title, input, text) : `# ${title}\n${text ? `\n${text}\n` : ''}`
  const name = fileNameFor(title)
  const file = kind.id === 'expense' ? `${input.date} ${name}` : name
  return { path: `${kind.folder}/${file}.md`, content: `---\n${fm.join('\n')}\n---\n\n${body}`, title }
}

// ---- wire types for POST /api/log ----

export type LogRequestBody =
  | { mode: 'new'; kind: string; title: string; values: Record<string, string>; text: string; date: string; how: string | null }
  | { mode: 'append'; kind: string; path: string; values: Record<string, string>; text: string; date: string; how: string | null }

export interface LogResponse {
  path: string
  mode: 'new' | 'append'
  warning: string | null
}
