// app/client/lib/theme.ts
// A workspace's theme (font, accent, radius): the same presets as miso's
// lib/theme.ts, applied as CSS variables on <html> while the workspace is open.
import { formatCss, oklch, wcagLuminance } from 'culori'
import type { WorkspaceTheme } from '../../lib/types'

// sheets: the font ids soii serves from /fonts/<id>.css (app/lib/fonts.ts); nothing is fetched from Google.
const FONTS: Record<string, { sans: string; mono: string; sheets: string[] }> = {
  sans: { sans: 'system-ui', mono: 'Geist Mono Variable', sheets: ['geist-mono'] },
  serif: { sans: "'Literata Variable'", mono: 'Geist Mono Variable', sheets: ['literata', 'geist-mono'] },
  mono: { sans: "'Geist Mono Variable'", mono: 'Geist Mono Variable', sheets: ['geist-mono'] },
  geometric: { sans: "'Manrope Variable'", mono: 'Geist Mono Variable', sheets: ['manrope', 'geist-mono'] },
  rounded: { sans: "'SN Pro Variable'", mono: 'Geist Mono Variable', sheets: ['sn-pro', 'geist-mono'] },
  blobby: { sans: "'Sour Gummy Variable'", mono: 'Azeret Mono Variable', sheets: ['sour-gummy', 'azeret-mono'] },
  awkward: { sans: "'Averia Sans Libre'", mono: 'Azeret Mono Variable', sheets: ['averia-sans-libre', 'azeret-mono'] },
  comic: { sans: 'Comic Sans MS, Comic Sans, cursive', mono: 'Geist Mono Variable', sheets: ['geist-mono'] }
}

const RADII: Record<string, string> = { squishy: '0.875rem', soft: '0.625rem', subtle: '0.375rem', square: '0' }

export const ACCENTS: Record<string, string | undefined> = {
  default: undefined,
  paper: 'oklch(0.4328 0.0351 66.67)',
  rose: 'oklch(0.6322 0.2171 26.02)',
  tangerine: 'oklch(0.6886 0.22 37.15)',
  sand: 'oklch(0.8334 0.1271 67.80)',
  mint: 'oklch(0.5774 0.1399 156.06)',
  sky: 'oklch(0.5824 0.1830 253.59)',
  lavender: 'oklch(0.6025 0.2426 294.58)'
}

// Dark accents keep the hue but lift dark presets (paper) to a lightness that reads on a dark page.
const DARK_PRIMARY_MIN_L = 0.65

function darkPrimary(primary: string): string {
  const color = oklch(primary)
  return color && color.l < DARK_PRIMARY_MIN_L ? formatCss({ ...color, l: DARK_PRIMARY_MIN_L }) : primary
}

export function colorVars(accent: string, dark = false): Record<string, string> {
  if (!dark) {
    return {
      '--primary': accent,
      '--primary-foreground': wcagLuminance(accent) > 0.3 ? 'oklch(0 0 0)' : 'oklch(1 0 0)',
      '--background': 'color-mix(in srgb, var(--primary) 2%, oklch(1 0 0) 98%)',
      '--foreground': 'color-mix(in srgb, var(--primary) 20%, oklch(0 0 0) 80%)',
      '--muted': 'color-mix(in srgb, var(--background) 95%, var(--foreground) 5%)',
      '--muted-foreground': 'color-mix(in srgb, var(--background) 50%, var(--foreground) 50%)',
      '--accent': 'color-mix(in srgb, var(--primary) 3%, var(--foreground) 4%)',
      '--accent-foreground': 'var(--foreground)',
      '--border': 'color-mix(in srgb, var(--foreground) 7%, transparent)',
      '--ring': 'color-mix(in srgb, var(--background) 50%, var(--primary) 50%)'
    }
  }
  const primary = darkPrimary(accent)
  return {
    '--primary': primary,
    '--primary-foreground': wcagLuminance(primary) > 0.3 ? 'oklch(0 0 0)' : 'oklch(1 0 0)',
    '--background': 'color-mix(in srgb, var(--primary) 3%, oklch(0.145 0 0) 97%)',
    '--foreground': 'color-mix(in srgb, var(--primary) 12%, oklch(0.985 0 0) 88%)',
    '--muted': 'color-mix(in srgb, var(--background) 92%, var(--foreground) 8%)',
    '--muted-foreground': 'color-mix(in srgb, var(--background) 40%, var(--foreground) 60%)',
    '--accent': 'color-mix(in srgb, var(--primary) 6%, var(--foreground) 8%)',
    '--accent-foreground': 'var(--foreground)',
    '--border': 'color-mix(in srgb, var(--foreground) 10%, transparent)',
    '--ring': 'color-mix(in srgb, var(--background) 50%, var(--primary) 50%)'
  }
}

const loadedFonts = new Set<string>()
let applied: string[] = []

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
let current: WorkspaceTheme | undefined

export function applyWorkspaceTheme(theme: WorkspaceTheme | undefined): void {
  current = theme
  const root = document.documentElement
  for (const key of applied) root.style.removeProperty(key)
  const vars: Record<string, string> = {}

  const font = FONTS[theme?.font ?? 'sans'] ?? FONTS.sans
  vars['--sans'] = `${font.sans}, var(--default-sans)`
  vars['--mono'] = `'${font.mono}', var(--default-mono)`
  for (const sheet of font.sheets) {
    if (loadedFonts.has(sheet)) continue
    loadedFonts.add(sheet)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `/fonts/${sheet}.css`
    document.head.appendChild(link)
  }

  vars['--radius'] = RADII[theme?.radius ?? 'soft'] ?? RADII.soft
  const primary = ACCENTS[theme?.accent ?? 'default']
  if (primary) Object.assign(vars, colorVars(primary, darkQuery?.matches ?? false))

  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
  applied = Object.keys(vars)
}

export const THEME_OPTIONS = {
  font: Object.keys(FONTS),
  accent: Object.keys(ACCENTS),
  radius: Object.keys(RADII)
}

// Accent presets set their colours inline, so they have to follow a system light/dark switch themselves.
darkQuery?.addEventListener('change', () => {
  if (applied.length > 0) applyWorkspaceTheme(current)
})
