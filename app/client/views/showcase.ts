// Pure showcase logic: options and what each row shows (picture, title, description).
import { z } from 'zod'
import type { NoteMeta } from '../../lib/types'
import { fieldText, resolveCard } from './gallery/options'

export const showcaseOptionsSchema = z
  .object({
    image: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    subtitle: z.string().min(1).optional(),
    description: z.string().min(1).optional()
  })
  .strict()

export type ShowcaseOptions = z.infer<typeof showcaseOptionsSchema>

export type ShowcaseRow = {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  image: string | null
}

/** Image and title resolve like a gallery card; the description falls back to the note's excerpt. */
export function showcaseRow(note: NoteMeta, options: ShowcaseOptions): ShowcaseRow {
  const card = resolveCard(note, { image: options.image, title: options.title, subtitle: options.subtitle })
  return {
    id: note.id,
    title: card.title,
    subtitle: options.subtitle ? card.subtitle : null,
    description: fieldText(note, options.description ?? 'description') ?? (note.excerpt || null),
    image: card.image
  }
}
