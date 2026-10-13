import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { texApiPath } from '../../lib/paths'
import type { NoteDoc } from '../../lib/types'
import { HttpError } from '../lib/http'
import { TexArticle, TexProblem, texProblem, TexSource } from './TexArticle'

const render = (ui: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)
const doc = { id: 'Papers/a.tex', title: 'On Quiet Rooms', path: 'Papers/a.tex', format: 'tex', source: '\\title{<b>x</b>}', backlinks: [] } as unknown as NoteDoc

describe('texApiPath', () => {
  test('encodes each segment', () => expect(texApiPath('Papers/My Paper (v2).tex')).toBe('/api/tex/Papers/My%20Paper%20(v2).tex'))
})

describe('texProblem', () => {
  test('a LaTeX error carries its log lines', () => {
    expect(texProblem(new HttpError('x', 422, { error: 'tex_failed', log: ['! Undefined control sequence.'] }))).toEqual({
      title: 'LaTeX stopped with an error',
      detail: null,
      log: ['! Undefined control sequence.']
    })
  })
  test('no compiler explains how to get one', () => {
    const p = texProblem(new HttpError('x', 503, { error: 'tex_no_compiler' }))
    expect(p.title).toBe('No LaTeX compiler found')
    expect(p.detail).toContain('brew install tectonic')
  })
  test('gone, hosted and timeout use the server message or a fallback', () => {
    expect(texProblem(new HttpError('x', 404, null)).title).toBe("This file isn't in the vault anymore.")
    expect(texProblem(new HttpError('LaTeX files compile in local mode only.', 501, null)).detail).toBe('LaTeX files compile in local mode only.')
    expect(texProblem(new Error('offline')).title).toBe("Couldn't compile this file")
  })
})

describe('TexArticle', () => {
  test('title and a PDF/Source toggle with PDF on', () => {
    const html = render(<TexArticle doc={doc} />)
    expect(html).toContain('On Quiet Rooms')
    expect(html).toMatch(/aria-pressed="true"[^>]*>PDF/)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Source/)
    expect(html).toContain('Compiling…')
  })
})

describe('TexSource and TexProblem', () => {
  test('source is shown as escaped text', () => expect(render(<TexSource source={doc.source!} />)).toContain('\\title{&lt;b&gt;x&lt;/b&gt;}'))
  test('a problem shows its title, log and a retry button', () => {
    const html = render(<TexProblem problem={{ title: 'LaTeX stopped with an error', detail: null, log: ['! Missing $ inserted.'] }} onRetry={() => {}} />)
    expect(html).toContain('LaTeX stopped with an error')
    expect(html).toContain('! Missing $ inserted.')
    expect(html).toContain('Try again')
  })
})
