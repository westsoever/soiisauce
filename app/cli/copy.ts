// app/cli/copy.ts
// Copying the starter vault and soii's skills into a vault.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Skills for the people who build and release soii, not for a vault that runs it: soii-install guides a first install, soii-release a release. */
export const NOT_FOR_VAULTS = ['soii-install', 'soii-release']

// What stays when you ask for an empty vault: the machinery, not Sam's notes.
const KEEP = ['.gitignore', '.obsidian', '.soii', 'Templates', 'soii.config.yml']

function walkFiles(root: string, rel = ''): string[] {
  return readdirSync(join(root, rel), { withFileTypes: true }).flatMap(e => {
    const path = rel ? `${rel}/${e.name}` : e.name
    return e.isDirectory() ? walkFiles(root, path) : [path]
  })
}

/** A YAML-safe value for `title:`: plain when it reads back the same, double-quoted otherwise. */
const yamlText = (text: string): string => (/^[\s\-?:,\[\]{}#&*!|>'"%@`]|:\s|:$|\s#|\s$/.test(text) ? JSON.stringify(text) : text)

export function copyTemplate(template: string, dest: string, opts: { empty: boolean; title: string }): void {
  if (existsSync(dest) && readdirSync(dest).length > 0) throw new Error(`${dest} is not empty. Pick a new folder, or an empty one.`)
  mkdirSync(dest, { recursive: true })
  const emptyDirs = new Set<string>()
  for (const file of walkFiles(template)) {
    const keep = !opts.empty || KEEP.some(k => file === k || file.startsWith(`${k}/`))
    if (keep) {
      mkdirSync(dirname(join(dest, file)), { recursive: true })
      cpSync(join(template, file), join(dest, file))
    } else if (file.includes('/') && !file.startsWith('Attachments/')) {
      emptyDirs.add(dirname(file))
    }
  }
  for (const dir of emptyDirs) {
    mkdirSync(join(dest, dir), { recursive: true })
    writeFileSync(join(dest, dir, '.gitkeep'), '')
  }
  // The starter says "Sam's vault"; the new vault is called what its owner calls it, sample notes or not.
  const config = join(dest, 'soii.config.yml')
  if (existsSync(config)) writeFileSync(config, readFileSync(config, 'utf8').replace(/^title:.*$/m, () => `title: ${yamlText(opts.title)}`))
}

/**
 * Install every skill folder upstream has (never a hard-coded list), except `exclude`, and remove the ones an earlier
 * sync installed that upstream no longer has (a rename leaves nothing behind). The manifest records what soii put there,
 * so a skill the owner made, or any folder not in it, is never touched.
 */
export function syncSkills(src: string, dest: string, manifestFile: string, exclude: string[] = []): { installed: string[]; removed: string[] } {
  let before: string[] = []
  try {
    const raw = (JSON.parse(readFileSync(manifestFile, 'utf8')) as { skills?: unknown }).skills
    if (Array.isArray(raw)) before = raw.filter((n): n is string => typeof n === 'string' && !n.includes('/') && !n.startsWith('.'))
  } catch {
    // no manifest yet, or an unreadable one: nothing to clean up
  }
  const available = existsSync(src) ? readdirSync(src, { withFileTypes: true }).filter(e => e.isDirectory() && !exclude.includes(e.name)).map(e => e.name).sort() : []
  const removed = before.filter(n => !available.includes(n) && existsSync(join(dest, n))).sort()
  for (const name of removed) rmSync(join(dest, name), { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const name of available) {
    rmSync(join(dest, name), { recursive: true, force: true })
    cpSync(join(src, name), join(dest, name), { recursive: true })
  }
  mkdirSync(dirname(manifestFile), { recursive: true })
  writeFileSync(manifestFile, `${JSON.stringify({ skills: available }, null, 2)}\n`)
  return { installed: available, removed }
}
