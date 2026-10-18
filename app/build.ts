// Builds soii:
//   api/_generated/vault/          the compiled vault — private, only the API reads it
//   api/_generated/server-entry.js the API bundled for app/serve.ts
//   dist/                          the public app shell (no vault content)
// Vault source: VAULT_PATH, the vault folder on disk.
//   bun app/build.ts [--dev] [--vault-only]   (--dev: unminified, sourcemaps; --vault-only: recompile the vault into an existing build, which is what a note edit needs)
// SOII_OUT_DIR=<dir> writes dist/ and api/_generated/ under <dir> instead of the repo (used by app/dev.test.ts).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import tailwind from 'bun-plugin-tailwind'
import { FONT_SHEETS, fontSheet } from './lib/fonts'
import { vaultNameFrom } from './lib/obsidian'
import { compileVault } from './vault/compile'

const dev = process.argv.includes('--dev')
const vaultOnly = process.argv.includes('--vault-only')
const ROOT = join(import.meta.dir, '..')
const OUT = process.env.SOII_OUT_DIR?.trim() ? resolve(process.env.SOII_OUT_DIR) : ROOT
const DIST = join(OUT, 'dist')
const API_GENERATED = join(OUT, 'api', '_generated')
// Tailwind resolves its packages from node_modules above the CSS file, so the styles stay inside the repo,
// in a folder of their own when the output is redirected.
const GENERATED = OUT === ROOT ? join(ROOT, 'app', '.generated') : join(ROOT, 'app', '.generated', `out-${basename(OUT)}`)
const CLIENT = join(ROOT, 'app', 'client')
const started = performance.now()

function fresh(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

function resolveVaultDir(): string {
  const local = process.env.VAULT_PATH?.trim()
  if (!local) throw new Error('Set VAULT_PATH to your vault folder.')
  const dir = resolve(ROOT, local.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'))
  if (!existsSync(dir)) throw new Error(`VAULT_PATH ${dir} doesn't exist.`)
  return dir
}

function formatLogs(logs: { message: string; position?: { file: string; line: number } | null }[]): string {
  return logs.map(l => `  ${l.position ? `${relative(ROOT, l.position.file)}:${l.position.line} ` : ''}${l.message}`).join('\n')
}

function writeStyles(): string {
  fresh(GENERATED)
  // Resolved, not joined onto ROOT/node_modules: installed as a dependency (<vault>/.soii/node_modules/soii) the packages sit one level up.
  const vocabulary = [join(dirname(Bun.resolveSync('tw-animate-css/package.json', ROOT)), 'dist', 'tw-animate.css'), Bun.resolveSync('shadcn/tailwind.css', ROOT)].map(p =>
    readFileSync(p, 'utf8')
  )
  const stylesPath = join(GENERATED, 'styles.css')
  writeFileSync(
    stylesPath,
    [
      `@import 'tailwindcss';`,
      `@plugin '@tailwindcss/typography';`,
      readFileSync(join(CLIENT, 'theme.css'), 'utf8'),
      ...vocabulary,
      `@custom-variant dark (&:is(.dark *));`,
      `@custom-variant dark-or-vivid (&:is(.dark *, [data-vivid], [data-vivid] *));`,
      `@source ${JSON.stringify(CLIENT)};`,
      readFileSync(join(CLIENT, 'base.css'), 'utf8')
    ].join('\n')
  )
  return stylesPath
}

async function buildClient(): Promise<{ main: string; css: string[] }> {
  fresh(DIST)
  const result = await Bun.build({
    entrypoints: [join(CLIENT, 'main.tsx'), writeStyles()],
    outdir: join(DIST, 'assets'),
    target: 'browser',
    format: 'esm',
    splitting: true,
    minify: !dev,
    sourcemap: dev ? 'linked' : 'none',
    publicPath: '/assets/',
    naming: { entry: '[name]-[hash].[ext]', chunk: 'chunk-[hash].[ext]', asset: '[name]-[hash].[ext]' },
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    plugins: [tailwind],
    throw: false
  })
  if (!result.success) throw new Error(`Client build failed:\n${formatLogs(result.logs)}`)
  const main = result.outputs.find(o => o.kind === 'entry-point' && /^main-[a-z0-9]+\.js$/.test(basename(o.path)))
  if (!main) throw new Error('Client build produced no main bundle')
  const css = result.outputs.filter(o => o.path.endsWith('.css')).map(o => `/assets/${basename(o.path)}`)
  css.sort((a, b) => Number(!basename(a).startsWith('styles-')) - Number(!basename(b).startsWith('styles-')))
  return { main: `/assets/${basename(main.path)}`, css }
}

function writeIndexHtml(main: string, css: string[]): void {
  const head = [...css.map(href => `<link rel="stylesheet" href="${href}" />`), `<script type="module" src="${main}"></script>`].join('\n    ')
  const html = readFileSync(join(CLIENT, 'index.html'), 'utf8').replace('<!-- soii:head -->', head)
  writeFileSync(join(DIST, 'index.html'), html)
}

// Copy file by file: cpSync on a directory makes Bun fire a watch event on the *source* folder,
// which `bun run dev` would read as an edit and rebuild forever.
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyTree(join(from, entry.name), join(to, entry.name))
    else copyFileSync(join(from, entry.name), join(to, entry.name))
  }
}

function copyPublic(): void {
  copyFileSync(join(CLIENT, 'manifest.webmanifest'), join(DIST, 'manifest.webmanifest'))
  copyFileSync(join(CLIENT, 'theme-init.js'), join(DIST, 'theme-init.js'))
  copyTree(join(CLIENT, 'icons'), join(DIST, 'icons'))
  copyFonts()
}

// dist/fonts/<id>.css and its woff2 files, so workspace fonts load from soii, not Google Fonts (app/lib/fonts.ts).
// Read and write rather than copyFileSync: copying a file this size makes Bun's watcher see an edit to the source.
function copyFonts(): void {
  for (const [id, sources] of Object.entries(FONT_SHEETS)) {
    mkdirSync(join(DIST, 'fonts', id), { recursive: true })
    const sheets = sources.map(source => {
      const file = Bun.resolveSync(source, ROOT)
      const sheet = fontSheet(readFileSync(file, 'utf8'), id)
      for (const f of sheet.files) writeFileSync(join(DIST, 'fonts', id, f), readFileSync(join(dirname(file), 'files', f)))
      return sheet.css
    })
    writeFileSync(join(DIST, 'fonts', `${id}.css`), sheets.join('\n'))
  }
}

async function buildServer(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(ROOT, 'app', 'server', 'app.ts')],
    outdir: API_GENERATED,
    target: 'bun',
    format: 'esm',
    minify: false,
    sourcemap: 'none',
    naming: { entry: 'server-entry.[ext]' },
    throw: false
  })
  if (!result.success) throw new Error(`Server build failed:\n${formatLogs(result.logs)}`)
  writeFileSync(
    join(API_GENERATED, 'server-entry.d.ts'),
    [
      `import type { Hono } from 'hono'`,
      `export declare function createSoiiApp(opts?: { generatedDir?: string }): Hono`,
      ''
    ].join('\n')
  )
}

async function main(): Promise<void> {
  if (vaultOnly && !existsSync(join(API_GENERATED, 'server-entry.js'))) throw new Error('--vault-only needs an existing build. Run without it first.')
  if (!vaultOnly) fresh(API_GENERATED)
  const vaultDir = resolveVaultDir()
  const vaultOut = join(API_GENERATED, 'vault')
  // A vault-only rebuild compiles beside the live output and swaps it in, so a note with a typo in its config
  // leaves the working build as it was instead of wiping it.
  const target = vaultOnly ? `${vaultOut}.next` : vaultOut
  if (vaultOnly) fresh(target)
  const { index, warnings } = await compileVault({ vaultDir, outDir: target, vaultName: vaultNameFrom(process.env), shippedSkillsDir: join(ROOT, '.claude', 'skills') })
  if (vaultOnly) {
    rmSync(vaultOut, { recursive: true, force: true })
    renameSync(target, vaultOut)
  }
  if (!vaultOnly) await buildApp()
  report(index.notes.length, warnings)
}

async function buildApp(): Promise<void> {
  const client = await buildClient()
  writeIndexHtml(client.main, client.css)
  copyPublic()
  await buildServer()
}

function report(notes: number, warnings: string[]): void {
  console.log(`soii: ${notes} notes, ${warnings.length} warnings, built in ${Math.round(performance.now() - started)}ms`)
  for (const w of warnings.slice(0, 50)) console.log(`  ! ${w}`)
  if (warnings.length > 50) console.log(`  … and ${warnings.length - 50} more (Vault → Build warnings)`)
}

main().catch(err => {
  console.error(`soii: build failed\n${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
