// app/client/vault/BuildWarnings.tsx
// Build info and compile warnings, collapsed with a count (spec §15).
import { formatLastActive } from '../lib/relative-time'

export function BuildWarnings({ warnings, builtAt, vaultCommit }: { warnings: string[]; builtAt: string; vaultCommit: string | null }) {
  return (
    <footer className="px-4 pb-6 text-xs text-muted-foreground md:px-6">
      <p>
        Built {formatLastActive(builtAt)}
        {vaultCommit ? ` from ${vaultCommit.slice(0, 7)}` : ''}
      </p>
      {warnings.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer">Build warnings ({warnings.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 font-mono">
            {warnings.map((w, i) => (
              <li key={i} className="wrap-anywhere whitespace-pre-wrap">
                {w}
              </li>
            ))}
          </ul>
        </details>
      )}
    </footer>
  )
}
