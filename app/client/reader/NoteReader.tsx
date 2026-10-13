// app/client/reader/NoteReader.tsx
// /n/<id>: breadcrumb, title (or a matching reader header), properties, body,
// backlinks, outline (spec §9). A stale link to a moved or deleted note gets a friendly 404.
import { IconArrowLeft } from '@tabler/icons-react'
import { useEffect } from 'react'
import type { NoteDoc, NoteId } from '../../lib/types'
import { openSearch } from '../components/SearchPalette'
import { HttpError } from '../lib/http'
import { useNote, useVault } from '../lib/queries'
import { goBack, navigate } from '../lib/router'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { Backlinks } from './Backlinks'
import { headerFor } from './headers'
import { NoteBody } from './NoteBody'
import { OpenInObsidian } from './OpenInObsidian'
import { Outline } from './Outline'
import { PropertiesPanel } from './PropertiesPanel'
import { TexArticle } from './TexArticle'
import { hideDuplicateTitle } from './title'

function Breadcrumb({ folder }: { folder: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <button type="button" className="shrink-0 hover:text-foreground" onClick={() => navigate('/vault')}>
        Vault
      </button>
      {folder
        .split('/')
        .filter(Boolean)
        .map((part, i) => (
          <span key={i} className="truncate">
            / {part}
          </span>
        ))}
    </div>
  )
}

function Article({ doc }: { doc: NoteDoc }) {
  const header = headerFor(doc)
  return (
    <div className="mx-auto flex max-w-5xl gap-10 px-4 py-6 md:px-8 md:py-10">
      <article className="min-w-0 max-w-3xl flex-1">
        {header ? <header.Component note={doc} /> : <h1 className="text-2xl font-medium tracking-tight">{doc.title}</h1>}
        <PropertiesPanel note={doc} hide={header?.hideFields ?? []} />
        <NoteBody doc={doc} className={hideDuplicateTitle(doc) ? 'soii-hide-first-h1' : undefined} />
        <Backlinks ids={doc.backlinks} />
      </article>
      <Outline headings={doc.headings} />
    </div>
  )
}

export function NoteReader({ id }: { id: NoteId }) {
  const note = useNote(id)
  const vault = useVault()
  const meta = vault.data?.notes.find(n => n.id === id)
  const title = note.data?.title ?? meta?.title ?? id.split('/').pop() ?? id
  const folder = meta?.folder ?? (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')
  const path = note.data?.path ?? meta?.path

  useEffect(() => {
    document.title = `${title} · ${vault.data?.config.title ?? 'soii'}`
  }, [title, vault.data?.config.title])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 md:h-12 md:px-3">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <IconArrowLeft stroke={1.75} />
          Back
        </Button>
        <Breadcrumb folder={folder} />
        <OpenInObsidian path={path} className="ml-auto" />
      </header>
      <main className="min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
        {note.isPending && (
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-10 md:px-8">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
        {note.isError && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
            <p className="font-medium">
              {note.error instanceof HttpError && note.error.status === 404 ? "This note isn't in the vault anymore." : "Couldn't load this note."}
            </p>
            <Button variant="outline" size="sm" onClick={openSearch}>
              Search the vault
            </Button>
          </div>
        )}
        {note.data && (note.data.format === 'tex' ? <TexArticle doc={note.data} /> : <Article doc={note.data} />)}
      </main>
    </div>
  )
}
