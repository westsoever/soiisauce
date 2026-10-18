// Serves a finished build on this machine: dist/ as static files
// with an index.html fallback, and /api/* through the bundled API. Bun loads
// .env.local itself. PORT defaults to 13390 (an empty PORT counts as unset).
import { existsSync, statSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { readEnv } from './server/env'
import { bindProblem } from './server/local'
import { readPort } from './server/port'
import { API_HEADERS, htmlHeaders } from './server/security-headers'

const ROOT = join(import.meta.dir, '..')
// Where the build wrote dist/ and api/_generated/: the repo, or SOII_OUT_DIR (soii installed in a vault builds into .soii/build).
const OUT = process.env.SOII_OUT_DIR?.trim() ? resolve(process.env.SOII_OUT_DIR) : ROOT
const DIST = join(OUT, 'dist')
const port = readPort()
const host = process.env.HOST ?? '127.0.0.1'
const entry = join(OUT, 'api', '_generated', 'server-entry.js')

const refusal = bindProblem(readEnv(process.env), host)
if (refusal) {
  console.error(refusal)
  process.exit(1)
}

if (!existsSync(entry) || !existsSync(join(DIST, 'index.html'))) {
  console.error('soii: no build yet. Run `bun run build` (or `bun run dev`).')
  process.exit(1)
}

type Entry = { createSoiiApp: (opts?: { generatedDir?: string; env?: Record<string, string | undefined> }) => { fetch: (r: Request) => Response | Promise<Response> } }
const { createSoiiApp } = (await import(entry)) as Entry
const app = createSoiiApp({ env: process.env, generatedDir: join(OUT, 'api', '_generated', 'vault') })

// SOII_OFFLINE=1: soii makes no outside requests, and the page's policy then forbids them too.
const PAGE_HEADERS = htmlHeaders(readEnv(process.env).offline)

/** index.html, and any other page: with the content policy. Everything else gets the plain headers. */
function page(file: string): Response {
  return new Response(Bun.file(file), { headers: { 'Cache-Control': 'no-cache', ...PAGE_HEADERS } })
}

function staticFile(pathname: string): Response | null {
  let rel: string
  try {
    rel = normalize(decodeURIComponent(pathname)).replace(/^\/+/, '')
  } catch {
    return null
  }
  if (rel.startsWith('..')) return null
  const path = join(DIST, rel)
  if (!rel || !existsSync(path) || !statSync(path).isFile()) return null
  if (/\.html?$/i.test(rel)) return page(path)
  return new Response(Bun.file(path), {
    headers: { 'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', ...API_HEADERS }
  })
}

// Start the release check now rather than at the first page view (local mode only; elsewhere this answers at once and does nothing).
void app.fetch(new Request('http://127.0.0.1/api/version', { headers: { Host: '127.0.0.1' } }))

Bun.serve({
  port,
  hostname: host,
  idleTimeout: 120,
  fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname.startsWith('/api/')) return app.fetch(req)
    return staticFile(pathname) ?? page(join(DIST, 'index.html'))
  }
})

console.log(`soii: http://localhost:${port}${readEnv(process.env).local ? ' (local mode)' : ''}`)
