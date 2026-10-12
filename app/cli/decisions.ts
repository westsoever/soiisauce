// app/cli/decisions.ts
// `soii update` shows what's new: the DECISIONS.md entries that weren't in the old install.
const ENTRY = /^\*\*D(\d+) ·/

export function newDecisions(before: string, after: string, max = 20): string[] {
  const known = new Set(before.split('\n').flatMap(l => ENTRY.exec(l)?.[1] ?? []))
  const out: string[] = []
  for (const line of after.split('\n')) {
    const id = ENTRY.exec(line)?.[1]
    if (!id || known.has(id)) continue
    const text = line.replace(/\*\*/g, '').trim()
    out.push(text.length > 200 ? `${text.slice(0, 199)}…` : text)
    if (out.length === max) break
  }
  return out
}
