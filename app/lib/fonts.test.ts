import { expect, test } from 'bun:test'
import { FONT_SHEETS, fontSheet } from './fonts'

const sample = `@font-face {
  font-family: 'Averia Sans Libre';
  font-weight: 400;
  src: url(./files/averia-sans-libre-latin-400-normal.woff2) format('woff2'), url(./files/averia-sans-libre-latin-400-normal.woff) format('woff');
  unicode-range: U+0000-00FF;
}`

test("a sheet points at soii's own copy of the woff2 files and drops the old woff fallback", () => {
  const { css, files } = fontSheet(sample, 'averia-sans-libre')
  expect(css).toContain("src: url(/fonts/averia-sans-libre/averia-sans-libre-latin-400-normal.woff2) format('woff2');")
  expect(css).not.toContain('.woff)')
  expect(css).toContain('unicode-range: U+0000-00FF;')
  expect(files).toEqual(['averia-sans-libre-latin-400-normal.woff2'])
})

test('a variable font keeps its format', () => {
  const { css, files } = fontSheet("src: url(./files/geist-mono-latin-wght-normal.woff2) format('woff2-variations');", 'geist-mono')
  expect(css).toBe("src: url(/fonts/geist-mono/geist-mono-latin-wght-normal.woff2) format('woff2-variations');")
  expect(files).toEqual(['geist-mono-latin-wght-normal.woff2'])
})

test('the sheets soii ships load every face from soii', () => {
  for (const [id, sources] of Object.entries(FONT_SHEETS)) {
    for (const s of sources) {
      const { css, files } = fontSheet(require('node:fs').readFileSync(Bun.resolveSync(s, import.meta.dir), 'utf8'), id)
      expect(css).not.toContain('./files/')
      expect(files.length).toBe(css.split('@font-face').length - 1)
    }
  }
})

test('every sheet comes from an installed package', () => {
  for (const sources of Object.values(FONT_SHEETS)) for (const s of sources) expect(() => Bun.resolveSync(s, import.meta.dir)).not.toThrow()
})
