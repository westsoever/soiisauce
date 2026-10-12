// app/server/port.ts
// The dev server's port. An empty PORT (what `cp .env.example .env.local` leaves behind) or a
// non-number means "not set": Number('') is 0, which would pick a random port.
export const DEFAULT_PORT = 13390
/** soii installed in a vault (SOII_LOCAL=1) listens here unless PORT says otherwise. */
export const LOCAL_PORT = 5011

export function readPort(source: Record<string, string | undefined> = process.env): number {
  const fallback = source.SOII_LOCAL === '1' ? LOCAL_PORT : DEFAULT_PORT
  const raw = source.PORT?.trim()
  if (!raw) return fallback
  const port = Number(raw)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback
}
