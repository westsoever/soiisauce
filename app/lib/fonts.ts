// app/lib/fonts.ts
// The workspace fonts (theme.font), served by soii itself from /fonts/<id>.css, not from Google Fonts, so opening
// a page asks nothing of anyone. The files come from the Fontsource packages (all SIL Open Font License).

/** Font id → the Fontsource stylesheets it is built from. */
export const FONT_SHEETS: Record<string, string[]> = {
  'geist-mono': ['@fontsource-variable/geist-mono/index.css'],
  literata: ['@fontsource-variable/literata/index.css'],
  manrope: ['@fontsource-variable/manrope/index.css'],
  'sn-pro': ['@fontsource-variable/sn-pro/index.css'],
  'sour-gummy': ['@fontsource-variable/sour-gummy/index.css'],
  'azeret-mono': ['@fontsource-variable/azeret-mono/index.css'],
  'averia-sans-libre': ['@fontsource/averia-sans-libre/400.css', '@fontsource/averia-sans-libre/700.css']
}

const SRC = /src:[^;]*;/g
const WOFF2 = /url\(\.\/files\/([^)]+\.woff2)\)\s*format\('(woff2(?:-variations)?)'\)/

/** Rewrites a Fontsource stylesheet to load its woff2 files from /fonts/<id>/ and lists the files it needs. */
export function fontSheet(css: string, id: string): { css: string; files: string[] } {
  const files: string[] = []
  const out = css.replace(SRC, src => {
    const m = WOFF2.exec(src)
    if (!m) return src
    files.push(m[1])
    return `src: url(/fonts/${id}/${m[1]}) format('${m[2]}');`
  })
  return { css: out, files }
}
