// app/vault/output.ts
// Writes the compiled vault to disk in the layout the server reads (spec §7.4).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { noteFileName } from '../lib/note-file'
import type { BuildMeta, NoteDoc, VaultIndex } from '../lib/types'

export function writeOutput(outDir: string, out: { index: VaultIndex; docs: NoteDoc[]; searchJson: string; meta: BuildMeta }): void {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(join(outDir, 'notes'), { recursive: true })
  mkdirSync(join(outDir, 'files'), { recursive: true })
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(out.index))
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(out.meta))
  writeFileSync(join(outDir, 'search.json'), out.searchJson)
  for (const doc of out.docs) writeFileSync(join(outDir, 'notes', noteFileName(doc.id)), JSON.stringify(doc))
}
