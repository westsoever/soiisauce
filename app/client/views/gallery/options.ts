// Pure gallery logic: options, per-type defaults, card fields, grouping (spec §11).
import { z } from 'zod'
import { parseLooseNumber } from '../../../lib/format'
import type { NoteMeta } from '../../../lib/types'

export type Aspect = 'poster' | 'square' | 'video'

export const galleryOptionsSchema = z
  .object({
    image: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    subtitle: z.string().min(1).optional(),
    badge: z.string().min(1).optional(),
    aspect: z.enum(['poster', 'square', 'video']).optional(),
    groupBy: z.string().min(1).optional()
  })
  .strict()

export type GalleryOptions = z.infer<typeof galleryOptionsSchema>

// The error is the raw ZodError so GalleryView can hand it to Core's OptionsError (D36 #6).
export function parseGalleryOptions(raw: unknown): { ok: true; options: GalleryOptions } | { ok: false; error: z.ZodError } {
  const result = galleryOptionsSchema.safeParse(raw ?? {})
  return result.success ? { ok: true, options: result.data } : { ok: false, error: result.error }
}

const DEFAULTS: Record<string, { aspect: Aspect; subtitle?: string; badge?: string }> = {
  book: { aspect: 'poster', subtitle: 'author', badge: 'status' },
  audiobook: { aspect: 'poster', subtitle: 'author', badge: 'status' },
  movie: { aspect: 'poster', subtitle: 'year' },
  documentary: { aspect: 'poster', subtitle: 'year' },
  video: { aspect: 'video', subtitle: 'channel' }
}

export function typeDefaults(type: string | null): { aspect: Aspect; subtitle?: string; badge?: string } {
  return (type && DEFAULTS[type]) || { aspect: 'square' }
}

export function majorityType(notes: NoteMeta[]): string | null {
  const counts = new Map<string, number>()
  for (const n of notes) if (n.type) counts.set(n.type, (counts.get(n.type) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [type, count] of counts) if (count > bestCount) [best, bestCount] = [type, count]
  return best
}

export function tabAspect(options: GalleryOptions, notes: NoteMeta[]): Aspect {
  if (options.aspect) return options.aspect
  const type = majorityType(notes)
  return type ? typeDefaults(type).aspect : 'poster'
}

const META_KEYS = new Set(['title', 'date', 'updated', 'type', 'folder', 'path'])

function scalarText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return null
}

export function fieldText(note: NoteMeta, field: string): string | null {
  const value = META_KEYS.has(field) ? (note as unknown as Record<string, unknown>)[field] : note.frontmatter[field]
  if (Array.isArray(value)) {
    const parts = value.filter(v => typeof v === 'string' || typeof v === 'number').map(scalarText).filter(Boolean)
    return parts.length ? parts.join(', ') : null
  }
  return scalarText(value)
}

export type CardSpec = {
  id: string
  title: string
  subtitle: string | null
  badge: string | null
  image: string | null
  rating: number | null
}

const SAFE_IMAGE = /^(https?:\/\/|\/api\/)/i

export function resolveCard(note: NoteMeta, options: GalleryOptions): CardSpec {
  const defaults = typeDefaults(note.type)
  const subtitleField = options.subtitle ?? defaults.subtitle
  const badgeField = options.badge ?? defaults.badge
  let image = note.image
  if (options.image) {
    const candidate = fieldText(note, options.image)
    image = candidate && SAFE_IMAGE.test(candidate) ? candidate : null
  }
  const rawRating = parseLooseNumber(note.frontmatter.rating)
  const rating =
    rawRating === null || Number.isNaN(rawRating) ? null : Math.round(Math.min(5, Math.max(0, rawRating)) * 2) / 2
  return {
    id: note.id,
    title: (options.title && fieldText(note, options.title)) || note.title,
    subtitle: subtitleField ? fieldText(note, subtitleField) : null,
    badge: badgeField ? fieldText(note, badgeField) : null,
    image,
    rating
  }
}

export type NoteGroup = { key: string; label: string; notes: NoteMeta[] }

export function groupNotes(notes: NoteMeta[], field: string): NoteGroup[] {
  const groups = new Map<string, NoteGroup>()
  const missing: NoteGroup = { key: '', label: `No ${field}`, notes: [] }
  for (const note of notes) {
    const raw = META_KEYS.has(field) ? (note as unknown as Record<string, unknown>)[field] : note.frontmatter[field]
    const first = Array.isArray(raw) ? raw.find(v => scalarText(v) !== null) : raw
    const label = scalarText(first)
    if (label === null) {
      missing.notes.push(note)
      continue
    }
    const key = label.toLowerCase()
    const group = groups.get(key) ?? { key, label, notes: [] }
    group.notes.push(note)
    groups.set(key, group)
  }
  return missing.notes.length ? [...groups.values(), missing] : [...groups.values()]
}
