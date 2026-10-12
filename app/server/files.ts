// Streams a compiled attachment. Only exact entries of the attachment set are
// served (no path joins from user input), sandboxed so an SVG can't run script.
import type { VaultStore } from './vault-store'

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm'
}

export function contentType(path: string): string {
  return TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

export function serveFile(store: VaultStore, path: string | null): Response {
  const file = path ? store.filePath(path) : null
  if (!file) return Response.json({ error: 'not_found' }, { status: 404 })
  return new Response(Bun.file(file), {
    headers: {
      'Content-Type': contentType(file),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    }
  })
}
