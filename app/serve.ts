// Serves a finished build locally the way Vercel does: dist/ as static files
// with an index.html fallback, and /api/* through the bundled API. Bun loads
// .env.local itself. PORT defaults to 13390 (an empty PORT counts as unset).
import { existsSync, statSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { readEnv } from './server/env'
import { bindProblem } from './server/local'
import { readPort } from './server/port'

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
  return new Response(Bun.file(path), {
    headers: { 'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' }
  })
}

Bun.serve({
  port,
  hostname: host,
  idleTimeout: 120,
  fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname.startsWith('/api/')) return app.fetch(req)
    return staticFile(pathname) ?? new Response(Bun.file(join(DIST, 'index.html')), { headers: { 'Cache-Control': 'no-cache' } })
  }
})

console.log(`soii: http://localhost:${port}${readEnv(process.env).local ? ' (local mode)' : ''}`)
