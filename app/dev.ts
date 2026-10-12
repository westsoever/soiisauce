// `bun run dev`: build, serve on PORT (default 13390), and rebuild + restart
// when app code or the VAULT_PATH vault changes. `--no-build` serves the last
// build as is (`bun run start`). `--no-serve` builds and watches without starting the server.
import { watch } from 'node:fs'
import { join } from 'node:path'
import type { Subprocess } from 'bun'

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
  // Build outputs, tooling folders, and client/icons (build.ts copies it into dist/, and the PNGs are generated).
  const IGNORED = /(^|\/)(node_modules|\.generated|_generated|dist|\.git|\.vault|\.artifacts|\.obsidian)(\/|$)|(^|\/)client\/icons(\/|$)/
  let timer: ReturnType<typeof setTimeout> | undefined
  let building = false
  let again = false
  const onChange = (_event: string, file: string | null) => {
    if (!file || IGNORED.test(file)) return
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
  watch(join(ROOT, 'app'), { recursive: true }, onChange)
  if (process.env.VAULT_PATH) watch(process.env.VAULT_PATH, { recursive: true }, onChange)
}

process.on('SIGINT', () => {
  server?.kill()
  process.exit(0)
})
