import { describe, expect, test } from 'bun:test'
import type { NoteMeta } from '../../lib/types'
import { showcaseOptionsSchema, showcaseRow } from './showcase'

function note(over: Partial<NoteMeta> = {}): NoteMeta {
  return {
    id: '04-Resources/Library/Recipes/Shakshuka',
    title: 'Shakshuka',
    path: '04-Resources/Library/Recipes/Shakshuka.md',
    folder: '04-Resources/Library/Recipes',
    type: 'recipe',
    tags: [],
    date: null,
    updated: null,
    frontmatter: {},
    excerpt: 'Eggs poached in a spiced tomato sauce.',
    image: '/api/file/shakshuka.jpg',
    wordCount: 200,
    ...over
  }
}

describe('showcaseRow', () => {
  test('picture, title and the description property', () => {
    const row = showcaseRow(note({ frontmatter: { description: 'One pan, twenty minutes.' } }), {})
    expect(row).toEqual({
      id: '04-Resources/Library/Recipes/Shakshuka',
      title: 'Shakshuka',
      subtitle: null,
      description: 'One pan, twenty minutes.',
      image: '/api/file/shakshuka.jpg'
    })
  })

  test('falls back to the excerpt without a description', () => {
    expect(showcaseRow(note(), {}).description).toBe('Eggs poached in a spiced tomato sauce.')
    expect(showcaseRow(note({ excerpt: '' }), {}).description).toBeNull()
  })

  test('options pick other fields', () => {
    const row = showcaseRow(note({ frontmatter: { summary: 'Brunch.', time: '20 min', photo: 'https://x.test/a.jpg' } }), {
      description: 'summary',
      subtitle: 'time',
      image: 'photo'
    })
    expect(row.description).toBe('Brunch.')
    expect(row.subtitle).toBe('20 min')
    expect(row.image).toBe('https://x.test/a.jpg')
  })

  test('unknown options are rejected', () => {
    expect(showcaseOptionsSchema.safeParse({ columns: 3 }).success).toBe(false)
  })
})
