// app/cli/log.ts
// The service log (~/Library/Logs/soii.log on macOS): every line gets the time it was written, and the file is
// kept small by moving it to soii.log.1 when `soii run` starts and it has grown past a limit.
import { copyFileSync, statSync, truncateSync } from 'node:fs'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local date and time to the second: `2026-10-15 18:05:03`. */
export function stamp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Feed it chunks of output; it writes them back a line at a time, each line prefixed with the time. */
export function lineStamper(write: (s: string) => void, now: () => Date = () => new Date()): ((chunk: string) => void) & { flush: () => void } {
  let rest = ''
  const feed = (chunk: string) => {
    const lines = (rest + chunk).split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) write(`${stamp(now())} ${line}\n`)
  }
  return Object.assign(feed, {
    flush: () => {
      if (rest) write(`${stamp(now())} ${rest}\n`)
      rest = ''
    }
  })
}

/**
 * Moves a log over `maxBytes` to `<file>.1` (replacing an older one) and empties it in place. Emptied, not renamed:
 * launchd and the background process keep the file open for appending, so they go on writing into it.
 */
export function trimLog(file: string, maxBytes: number): boolean {
  try {
    if (statSync(file).size <= maxBytes) return false
    copyFileSync(file, `${file}.1`)
    truncateSync(file, 0)
    return true
  } catch {
    return false
  }
}
