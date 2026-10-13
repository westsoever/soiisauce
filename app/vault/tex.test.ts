// app/vault/tex.test.ts
import { describe, expect, test } from 'bun:test'
import { stripTexComments, texEngine, texNote, texPlainText, texTitle } from './tex'

const DOC = [
  '\\documentclass{article}',
  '\\title{On Quiet Rooms}',
  '\\begin{document}',
  '\\maketitle',
  '\\section{Intro} Hello \\emph{world} 50\\% done. % hidden remark',
  '\\end{document}',
  ''
].join('\n')

describe('stripTexComments', () => {
  test('drops % to end of line but keeps an escaped \\%', () => {
    expect(stripTexComments('a 50\\% b % note\n% whole line\nc')).toBe('a 50\\% b \n\nc')
  })
})

describe('texTitle', () => {
  test('plain title', () => expect(texTitle(DOC)).toBe('On Quiet Rooms'))
  test('commands and \\\\ line breaks are stripped', () => expect(texTitle('\\title{\\textbf{Big} \\\\ Small}')).toBe('Big Small'))
  test('optional short title is skipped, nested braces kept as text', () =>
    expect(texTitle('\\title[Short]{Long {Nested} Title}')).toBe('Long Nested Title'))
  test('a commented-out title does not count', () => expect(texTitle('% \\title{Old}\n\\title{New}')).toBe('New'))
  test('missing or empty title is null', () => {
    expect(texTitle('\\begin{document}x\\end{document}')).toBeNull()
    expect(texTitle('\\title{}')).toBeNull()
  })
})

describe('texPlainText', () => {
  test('only the document body, without commands or comments', () => expect(texPlainText(DOC)).toBe('Intro Hello world 50% done.'))
  test('a file without \\begin{document} (a chapter) uses all of it', () => expect(texPlainText('Some \\textit{chapter} text.')).toBe('Some chapter text.'))
})

describe('texEngine', () => {
  test('pdflatex by default', () => expect(texEngine(DOC)).toBe('pdflatex'))
  test('fontspec or unicode-math means xelatex', () => {
    expect(texEngine('\\usepackage{fontspec}')).toBe('xelatex')
    expect(texEngine('\\usepackage[math-style=ISO]{unicode-math}')).toBe('xelatex')
  })
  test('a commented-out fontspec does not count', () => expect(texEngine('% \\usepackage{fontspec}')).toBe('pdflatex'))
  test('a magic comment in the first 20 lines wins', () => {
    expect(texEngine('% !TEX program = LuaLaTeX\n\\usepackage{fontspec}')).toBe('lualatex')
    expect(texEngine('% !TEX TS-program = pdflatex\n\\usepackage{fontspec}')).toBe('pdflatex')
    expect(texEngine(`${'\n'.repeat(25)}% !TEX program = lualatex`)).toBe('pdflatex')
  })
})

describe('texNote', () => {
  test('builds the NoteMeta for a .tex file', () => {
    const { meta, plainText } = texNote('Papers/thesis.tex', DOC)
    expect(plainText).toBe('Intro Hello world 50% done.')
    expect(meta).toEqual({
      id: 'Papers/thesis.tex',
      title: 'On Quiet Rooms',
      path: 'Papers/thesis.tex',
      folder: 'Papers',
      type: null,
      tags: [],
      date: null,
      updated: null,
      frontmatter: {},
      excerpt: 'Intro Hello world 50% done.',
      image: null,
      wordCount: 5,
      format: 'tex'
    })
  })

  test('falls back to the file name; root files have folder ""', () => {
    expect(texNote('notes.TEX', 'x').meta).toMatchObject({ title: 'notes', folder: '', id: 'notes.TEX' })
  })
})
