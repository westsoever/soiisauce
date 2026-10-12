// Read-only: lists vault notes whose whole content is base64 of readable text —
// usually an agent that wrote the encoded payload instead of the markdown.
// soii renders such notes as one long line; fix them in the vault, not here.
//
//   bun scripts/find-base64-notes.ts <vaultDir>
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export function decodeBase64Markdown(text: string): string | null {
  const compact = text.replace(/\s+/g, '')
  if (compact.length < 24 || compact.length % 4 !== 0 || !BASE64.test(compact)) return null
  const decoded = Buffer.from(compact, 'base64').toString('utf8')
  if (Buffer.from(decoded, 'utf8').toString('base64') !== compact) return null
  const printable = decoded.replace(/[^\t\n\r\x20-\x7e -￿]/g, '').length
  if (decoded.includes('�') || printable / decoded.length < 0.97) return null
  if (!/\s/.test(decoded)) return null
  return decoded
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
}

export function findBase64Notes(vaultDir: string): { path: string; firstLine: string }[] {
  const files: string[] = []
  walk(vaultDir, files)
  const hits: { path: string; firstLine: string }[] = []
  for (const file of files) {
    const decoded = decodeBase64Markdown(readFileSync(file, 'utf8'))
    if (decoded === null) continue
    hits.push({ path: relative(vaultDir, file).split(sep).join('/'), firstLine: decoded.split('\n')[0] ?? '' })
  }
  // Code-unit order, so the output is the same on every machine (localeCompare ranks "_" before digits).
  return hits.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

if (import.meta.main) {
  const vaultDir = process.argv[2]
  if (!vaultDir) {
    console.error('Usage: bun scripts/find-base64-notes.ts <vaultDir>')
    process.exit(2)
  }
  const hits = findBase64Notes(vaultDir)
  for (const hit of hits) console.log(`${hit.path}\t${hit.firstLine}`)
  console.log(`${hits.length} base64-encoded note${hits.length === 1 ? '' : 's'} found.`)
}
