// app/client/reader/title.test.ts
import { describe, expect, test } from 'bun:test'
import { hideDuplicateTitle } from './title'

describe('hideDuplicateTitle', () => {
  test('hides a leading H1 that repeats the title', () => {
    expect(hideDuplicateTitle({ title: 'Home', headings: [{ depth: 1, text: 'Home', slug: 'home' }], html: '<h1 id="home">Home</h1><p>x</p>' })).toBe(true)
  })
  test('keeps an H1 that differs, or that is not first in the body', () => {
    expect(hideDuplicateTitle({ title: 'Dune', headings: [{ depth: 1, text: 'Plot', slug: 'plot' }], html: '<h1 id="plot">Plot</h1>' })).toBe(false)
    expect(hideDuplicateTitle({ title: 'Home', headings: [{ depth: 1, text: 'Home', slug: 'home' }], html: '<p>intro</p><h1 id="home">Home</h1>' })).toBe(false)
    expect(hideDuplicateTitle({ title: 'Home', headings: [], html: '<p>x</p>' })).toBe(false)
  })
})
