// `bun run dev`: build, serve on PORT (default 13390), and rebuild + restart
// when app code or the VAULT_PATH vault changes. `--no-build` serves the last
// build as is (`bun run start`). `--no-serve` builds and watches without starting the server.
import { watch } from 'node:fs'
import { join } from 'node:path'
import type { Subprocess } from 'bun'
import { isIgnoredVaultPath } from './cli/watch'

const ROOT = join(import.meta.dir, '..')
const noBuild = process.argv.includes('--no-build')
const noServe = process.argv.includes('--no-serve')

async function build(): Promise<boolean> {
  const proc = Bun.spawn(['bun', join(ROOT, 'app', 'build.ts'), '--dev'], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' })
  return (await proc.exited) === 0
}

let server: Subprocess | null = null
function restart(): void {
  if (noServe) return
  server?.kill()
  // The child inherits process.env, so PORT and VAULT_PATH pass straight through.
  server = Bun.spawn(['bun', join(ROOT, 'app', 'serve.ts')], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' })
}

if (noBuild) restart()
else {
  if (!(await build())) process.exit(1)
  restart()
  // The app folder: build outputs, tooling folders, and client/icons (build.ts copies it into dist/, and the PNGs are generated).
  const IGNORED = /(^|\/)(node_modules|\.generated|_generated|dist|\.git|\.vault|\.artifacts|\.obsidian)(\/|$)|(^|\/)client\/icons(\/|$)/
  let timer: ReturnType<typeof setTimeout> | undefined
  let building = false
  let again = false
  const schedule = (file: string) => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      if (building) {
        again = true
        return
      }
      building = true
      do {
        again = false
        console.log(`soii: ${file} changed, rebuilding…`)
        if (await build()) restart()
      } while (again)
      building = false
    }, 200)
  }
  watch(join(ROOT, 'app'), { recursive: true }, (_event, file) => {
    if (file && !IGNORED.test(file)) schedule(file)
  })
  // The vault follows the rule `soii run` uses (cli/watch.ts), so a TeX compile writing into .soii/cache doesn't restart the server.
  if (process.env.VAULT_PATH) {
    watch(process.env.VAULT_PATH, { recursive: true }, (_event, file) => {
      if (file && !isIgnoredVaultPath(file)) schedule(file)
    })
  }
}

process.on('SIGINT', () => {
  server?.kill()
  process.exit(0)
})
