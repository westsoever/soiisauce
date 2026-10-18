// app/server/security-headers.ts
// Response headers for soii's own pages and API. soii has no sign-in, so what stops a page open in another tab from
// using it is these (and the Host / Origin checks): no framing (clickjacking), nothing but soii's own scripts running
// (an injected one can't call the API), no referrer (it would carry note titles), no sniffing.

// Fonts and styles are soii's own (the fonts are bundled, app/lib/fonts.ts), so no other host is allowed for them.
// style-src needs 'unsafe-inline' for the style="" attributes React and the charts set; inline styles can't run code.
// img-src is open to http(s) because notes show remote images (clipped pages) and covers redirect to Google, TMDB and YouTube.
// frame-src blob: is the .tex viewer, which shows a compiled PDF from a blob: URL.
// Offline (SOII_OFFLINE=1): soii asks no other host for anything, so the page may not either: no remote images.
export function buildCsp(offline: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    offline ? "img-src 'self' data: blob:" : "img-src 'self' data: blob: http: https:",
    "media-src 'self' blob:",
    "frame-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
}

export const CSP = buildCsp(false)

/** Every response: the API's, and the page's. */
export const API_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin'
}

/** The page itself (index.html) also carries the content policy. */
export const htmlHeaders = (offline: boolean): Record<string, string> => ({ ...API_HEADERS, 'Content-Security-Policy': buildCsp(offline) })
export const HTML_HEADERS = htmlHeaders(false)

/** Set each header the response doesn't already have (an attachment keeps its own, stricter policy). */
export function addMissingHeaders(headers: Headers, extra: Record<string, string>): void {
  for (const [name, value] of Object.entries(extra)) if (!headers.has(name)) headers.set(name, value)
}
