// app/client/reader/NoteBody.tsx
// A note's rendered body. The HTML was sanitised at build time
// (rehype-sanitize, spec §7.3); here we only intercept in-app links and anchors.
import { useEffect, type MouseEvent } from 'react'
import type { NoteDoc } from '../../lib/types'
import { navigate } from '../lib/router'
import { cn } from '../ui/utils'

function scrollToHash(hash: string, smooth: boolean): void {
  let id = hash.replace(/^#/, '')
  try {
    id = decodeURIComponent(id)
  } catch {
    // a malformed escape (e.g. "#100%") just means no heading to scroll to
  }
  if (id) document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
}

export function NoteBody({ doc, className }: { doc: NoteDoc; className?: string }) {
  useEffect(() => {
    if (location.hash) scrollToHash(location.hash, false)
  }, [doc.id])

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const anchor = (e.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href || anchor?.target === '_blank') return
    if (href.startsWith('#')) {
      e.preventDefault()
      history.replaceState(null, '', href)
      scrollToHash(href, true)
      return
    }
    if (href.startsWith('/n/')) {
      e.preventDefault()
      const [path, hash] = href.split('#')
      if (path === location.pathname) {
        history.replaceState(null, '', href)
        if (hash) scrollToHash(hash, true)
      } else navigate(href)
    }
  }

  return (
    // biome-ignore lint/a11y: link clicks bubble from the sanitised HTML inside.
    <div
      onClick={onClick}
      className={cn('soii-note prose prose-sm max-w-none min-w-0 wrap-anywhere prose-inherit', className)}
      dangerouslySetInnerHTML={{ __html: doc.html }}
    />
  )
}
