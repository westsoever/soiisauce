// The origin a request was made to (scheme://host[:port]), for the same-origin check on writes and for absolute URLs.
import type { Context } from 'hono'

export function requestOrigin(c: Context): string {
  return new URL(c.req.url).origin
}
