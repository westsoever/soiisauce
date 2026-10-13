// app/client/reader/TexArticle.tsx
// The reader for a .tex note: the PDF soii compiles on open, or the LaTeX source (spec: .tex viewer §5).
import { useEffect, useState } from 'react'
import type { NoteDoc } from '../../lib/types'
import { HttpError } from '../lib/http'
import { useTexPdf } from '../lib/queries'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { Backlinks } from './Backlinks'

export interface TexProblemInfo {
  title: string
  detail: string | null
  log: string[]
}

export function texProblem(err: unknown): TexProblemInfo {
  if (err instanceof HttpError) {
    const body = err.body as { log?: unknown } | null
    if (err.status === 422) return { title: 'LaTeX stopped with an error', detail: null, log: Array.isArray(body?.log) ? body.log.map(String) : [] }
    if (err.status === 503)
      return {
        title: 'No LaTeX compiler found',
        detail: 'Install one with `brew install tectonic` (small, fetches packages as needed) or MacTeX, then reopen this file.',
        log: []
      }
    if (err.status === 404) return { title: "This file isn't in the vault anymore.", detail: null, log: [] }
    return { title: "Couldn't compile this file", detail: err.message, log: [] }
  }
  return { title: "Couldn't compile this file", detail: null, log: [] }
}

export function TexSource({ source }: { source: string }) {
  return <pre className="max-h-[75dvh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs whitespace-pre shadow-xs">{source}</pre>
}

export function TexProblem({ problem, onRetry }: { problem: TexProblemInfo; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg bg-destructive/10 p-4 text-sm">
      <p className="font-medium text-destructive">{problem.title}</p>
      {problem.detail && <p className="text-muted-foreground">{problem.detail}</p>}
      {problem.log.length > 0 && <pre className="overflow-auto font-mono text-xs whitespace-pre">{problem.log.join('\n')}</pre>}
      <div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}

function TexPdf({ blob, title }: { blob: Blob; title: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  if (!url) return <Skeleton className="h-[75dvh] w-full" />
  return <iframe title={title} src={url} className="h-[75dvh] w-full rounded-lg bg-muted shadow-xs" />
}

export function TexArticle({ doc }: { doc: NoteDoc }) {
  const [view, setView] = useState<'pdf' | 'source'>('pdf')
  const pdf = useTexPdf(doc.id)
  const source = doc.source ?? ''
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-medium tracking-tight">{doc.title}</h1>
      <div className="flex gap-1">
        {(['pdf', 'source'] as const).map(v => (
          <Button key={v} size="sm" variant={view === v ? 'secondary' : 'ghost'} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === 'pdf' ? 'PDF' : 'Source'}
          </Button>
        ))}
      </div>
      {view === 'source' && <TexSource source={source} />}
      {view === 'pdf' && pdf.isPending && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Compiling…</p>
          <Skeleton className="h-[75dvh] w-full" />
        </div>
      )}
      {view === 'pdf' && pdf.isError && (
        <>
          <TexProblem problem={texProblem(pdf.error)} onRetry={() => void pdf.refetch()} />
          <TexSource source={source} />
        </>
      )}
      {view === 'pdf' && pdf.data && <TexPdf blob={pdf.data} title={doc.title} />}
      <Backlinks ids={doc.backlinks} />
    </div>
  )
}
