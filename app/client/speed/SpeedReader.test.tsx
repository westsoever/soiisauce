import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpeedReader } from './SpeedReader'

describe('SpeedReader', () => {
  const html = renderToStaticMarkup(<SpeedReader />)

  test('opens empty: says how to start, and Start is disabled', () => {
    expect(html).toContain('Paste a text below to start.')
    expect(html).toContain('Nothing to read yet')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*?Start/)
  })

  test('has a text box and a words-per-minute field at the default speed', () => {
    expect(html).toContain('placeholder="Paste or type the text you want to read."')
    expect(html).toContain('aria-label="Words per minute"')
    expect(html).toContain('value="300"')
  })

  test('the icon-only controls are named', () => {
    expect(html).toContain('aria-label="Slower by 50 words per minute"')
    expect(html).toContain('aria-label="Faster by 50 words per minute"')
    expect(html).toContain('aria-label="Back to the first word"')
  })
})
