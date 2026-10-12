// app/lib/glob.ts
// A small glob matcher (`**`, `*`, `?`, `{a,b}`), case-insensitive, used for
// config `exclude` and query `path` clauses on both the build and the client.
const ESCAPE = /[.+^${}()|[\]\\*?]/g

function escape(text: string): string {
  return text.replace(ESCAPE, '\\$&')
}

/** Index of the `}` closing the `{` at `open`, or -1. Nested braces are balanced. */
function closingBrace(glob: string, open: number, hi: number): number {
  let depth = 0
  for (let i = open; i < hi; i++) {
    if (glob[i] === '{') depth++
    else if (glob[i] === '}' && --depth === 0) return i
  }
  return -1
}

/** [from, to) bounds of each top-level comma-separated alternative in glob[lo, hi). */
function alternatives(glob: string, lo: number, hi: number): [number, number][] {
  const bounds: [number, number][] = []
  let depth = 0
  let from = lo
  for (let i = lo; i < hi; i++) {
    if (glob[i] === '{') depth++
    else if (glob[i] === '}') depth--
    else if (glob[i] === ',' && depth === 0) {
      bounds.push([from, i])
      from = i + 1
    }
  }
  bounds.push([from, hi])
  return bounds
}

// `segStart` / `atEnd`: whether glob[lo, hi) begins a path segment / ends the whole pattern,
// so `**` inside a `{}` alternative is read in the context of the surrounding glob.
function translate(glob: string, lo: number, hi: number, segStart: boolean, atEnd: boolean): string {
  let re = ''
  for (let i = lo; i < hi; i++) {
    const c = glob[i]
    if (c === '*') {
      if (i + 1 < hi && glob[i + 1] === '*') {
        const atSegmentStart = i === lo ? segStart : glob[i - 1] === '/'
        if (atSegmentStart && i + 2 < hi && glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 2
          continue
        }
        if (atSegmentStart && i + 2 === hi && atEnd) {
          re = re.endsWith('/') ? `${re.slice(0, -1)}(?:/.*)?` : `${re}.*`
          i += 1
          continue
        }
        re += '.*'
        i += 1
        continue
      }
      re += '[^/]*'
      continue
    }
    if (c === '?') {
      re += '[^/]'
      continue
    }
    if (c === '{') {
      const end = closingBrace(glob, i, hi)
      if (end > i) {
        const openStart = i === lo ? segStart : glob[i - 1] === '/'
        const openEnd = atEnd && end + 1 === hi
        re += `(?:${alternatives(glob, i + 1, end).map(([from, to]) => translate(glob, from, to, openStart, openEnd)).join('|')})`
        i = end
        continue
      }
    }
    re += escape(c)
  }
  return re
}

export function globToRegExp(input: string): RegExp {
  // Like picomatch, a leading "./" or "/" is ignored; paths are vault-relative.
  // Consecutive `**/` collapse into one: each would otherwise be an independent
  // split point and a failing match backtracks through every combination.
  const glob = input.replace(/^(?:\.\/|\/)+/, '').replace(/(^|\/)(?:\*\*\/){2,}/g, '$1**/')
  return new RegExp(`^${translate(glob, 0, glob.length, true, true)}$`, 'i')
}

const cache = new Map<string, RegExp>()

export function matchesGlob(path: string, glob: string | string[]): boolean {
  const globs = Array.isArray(glob) ? glob : [glob]
  return globs.some(g => {
    let re = cache.get(g)
    if (!re) {
      re = globToRegExp(g)
      cache.set(g, re)
    }
    return re.test(path)
  })
}
