import { expect, test } from 'bun:test'
import { oklch } from 'culori'
import { ACCENTS, colorVars } from './theme'

const presets = Object.entries(ACCENTS).filter((e): e is [string, string] => e[1] !== undefined)

test('light accents set a near-white page and keep the preset as primary', () => {
  const vars = colorVars(ACCENTS.sky as string)
  expect(vars['--primary']).toBe(ACCENTS.sky as string)
  expect(vars['--background']).toContain('oklch(1 0 0)')
  expect(vars['--foreground']).toContain('oklch(0 0 0)')
})

test('dark accents set a near-black page and a light foreground', () => {
  const vars = colorVars(ACCENTS.sky as string, true)
  expect(vars['--background']).toContain('oklch(0.145 0 0)')
  expect(vars['--foreground']).toContain('oklch(0.985 0 0)')
})

test('dark primaries are lifted to a legible lightness, hue kept, light ones untouched', () => {
  for (const [, accent] of presets) {
    const primary = colorVars(accent, true)['--primary']
    const l = oklch(primary)?.l ?? 0
    expect(l).toBeGreaterThanOrEqual(0.65 - 1e-6)
    if ((oklch(accent)?.l ?? 0) >= 0.65) expect(primary).toBe(accent) // e.g. rose, sand stay as they are
  }
  const paper = ACCENTS.paper as string
  expect(oklch(colorVars(paper, true)['--primary'])?.h).toBeCloseTo(oklch(paper)?.h ?? 0, 0)
})

test('light and dark define the same set of variables', () => {
  const accent = ACCENTS.mint as string
  expect(Object.keys(colorVars(accent, true)).sort()).toEqual(Object.keys(colorVars(accent)).sort())
})
