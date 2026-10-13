// app/vault/tex.ts
// What soii reads out of a LaTeX source without running TeX: a title, plain text for
// search and excerpts, and which engine the document wants. Shared by the compiler and server.
import { posix } from 'node:path'
import type { NoteMeta } from '../lib/types'

export type TexEngine = 'pdflatex' | 'xelatex' | 'lualatex'

/** Drops `%` comments line by line. An escaped `\%` is text, not a comment. */
export function stripTexComments(source: string): string {
  return source
    .split('\n')
    .map(line => line.replace(/(^|[^\\])%.*$/, '$1'))
    .join('\n')
}

/** Rough LaTeX → text: drops commands, environment markers and braces; keeps escaped specials. */
export function texToPlain(tex: string): string {
  return tex
    .replace(/\\\\(\[[^\]]*\])?/g, ' ')
    .replace(/\\([%&$#_])/g, '$1')
    .replace(/\\(?:begin|end)\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The text inside the brace group that opens at `from`, or null if there is none or it never closes. */
function braceArg(text: string, from: number): string | null {
  if (text[from] !== '{') return null
  let depth = 0
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(from + 1, i)
  }
  return null
}

export function texTitle(source: string): string | null {
  const text = stripTexComments(source)
  const m = /\\title\s*(?:\[[^\]]*\])?\s*(?=\{)/.exec(text)
  if (!m) return null
  const arg = braceArg(text, m.index + m[0].length)
  const title = arg === null ? '' : texToPlain(arg)
  return title || null
}

export function texPlainText(source: string): string {
  const text = stripTexComments(source)
  const begin = '\\begin{document}'
  const start = text.indexOf(begin)
  if (start === -1) return texToPlain(text)
  const end = text.lastIndexOf('\\end{document}')
  return texToPlain(text.slice(start + begin.length, end > start ? end : undefined))
}

export function texEngine(source: string): TexEngine {
  const head = source.split('\n').slice(0, 20).join('\n')
  const magic = /^\s*%\s*!\s*TEX\s+(?:TS-)?program\s*=\s*(pdflatex|xelatex|lualatex)\b/im.exec(head)
  if (magic) return magic[1].toLowerCase() as TexEngine
  return /\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:fontspec|unicode-math)\b/.test(stripTexComments(source)) ? 'xelatex' : 'pdflatex'
}

/** A `.tex` file as a note: id and path are the vault path, extension included. */
export function texNote(path: string, source: string): { meta: NoteMeta; plainText: string } {
  const plainText = texPlainText(source)
  const dir = posix.dirname(path)
  return {
    plainText,
    meta: {
      id: path,
      title: texTitle(source) ?? posix.basename(path).replace(/\.tex$/i, ''),
      path,
      folder: dir === '.' ? '' : dir,
      type: null,
      tags: [],
      date: null,
      updated: null,
      frontmatter: {},
      excerpt: plainText.slice(0, 200),
      image: null,
      wordCount: plainText ? plainText.split(' ').length : 0,
      format: 'tex'
    }
  }
}
