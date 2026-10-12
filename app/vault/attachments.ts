// app/vault/attachments.ts
// Attachment sizes (for the 10 MB per-file cap) and copying the referenced ones
// into api/_generated/vault/files/ (spec §7.1).
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function fileSizes(vaultDir: string, paths: string[], fsPaths: Map<string, string> = new Map()): Map<string, number> {
  return new Map(paths.map(p => [p, statSync(join(vaultDir, fsPaths.get(p) ?? p)).size]))
}

/** Copies under the NFC path (what URLs and the server use), reading from the on-disk spelling. */
export function copyAttachments(vaultDir: string, outDir: string, paths: Iterable<string>, fsPaths: Map<string, string> = new Map()): void {
  for (const p of paths) {
    const dest = join(outDir, 'files', p)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(vaultDir, fsPaths.get(p) ?? p), dest)
  }
}
