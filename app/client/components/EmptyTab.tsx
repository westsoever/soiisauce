// app/client/components/EmptyTab.tsx
// Empty states. An empty tab teaches the frontmatter convention its query needs (spec §9).
import { describeQuery } from '../../lib/query'
import type { TabConfig } from '../../lib/types'

function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 ? (
          <code key={i} className="rounded-xs bg-accent px-1 py-0.5 font-mono text-xs text-foreground">
            {part}
          </code>
        ) : (
          part
        )
      )}
    </>
  )
}

export function EmptyTab({ tab }: { tab: TabConfig }) {
  const lines = describeQuery(tab.query)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
      <p className="font-medium">No notes match this tab yet.</p>
      {lines.map((line, i) => (
        <p key={i} className="max-w-md text-muted-foreground">
          <InlineCode text={i === 0 ? line : `Or: ${line[0].toLowerCase()}${line.slice(1)}`} />
        </p>
      ))}
    </div>
  )
}

export function NothingHere({ message = 'Nothing here.' }: { message?: string }) {
  return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">{message}</div>
}
