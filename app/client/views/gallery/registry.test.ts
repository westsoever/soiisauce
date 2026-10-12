import { expect, test } from 'bun:test'
import * as registryModule from '../registry'
import { GalleryView } from '../GalleryView'

test('gallery view is registered', () => {
  const registry = Object.values(registryModule).find(
    v => v && typeof v === 'object' && 'gallery' in (v as Record<string, unknown>)
  ) as Record<string, unknown> | undefined
  expect(registry).toBeDefined()
  expect(registry!.gallery).toBe(GalleryView)
})
