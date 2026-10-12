// Regression test for the dev rebuild loop: `bun run dev` must rebuild exactly once
// per vault edit. A build that touches its own watched sources would re-trigger itself.
// The build writes to a temp SOII_OUT_DIR, so running the tests never clobbers the worktree's own dist/ and api/_generated/.
import { afterAll, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const vault = mkdtempSync(join(tmpdir(), 'soii-dev-vault-'))
const out = mkdtempSync(join(tmpdir(), 'soii-dev-out-'))
mkdirSync(join(vault, 'Notes'))
writeFileSync(join(vault, 'Notes', 'One.md'), '---\ntype: note\n---\nFirst version.\n')
afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
  rmSync(join(ROOT, 'app', '.generated', `out-${basename(out)}`), { recursive: true, force: true })
})

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Every file under a folder with its size and mtime, or 'absent': enough to tell if a build touched it.
function snapshot(dir: string): string[] {
  if (!existsSync(dir)) return ['absent']
  const lines: string[] = []
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else lines.push(`${path}:${stat.size}:${stat.mtimeMs}`)
    }
  }
  walk(dir)
  return lines
}

test('dev rebuilds once per vault edit and then stays quiet, writing only to SOII_OUT_DIR', async () => {
  const worktreeBefore = [snapshot(join(ROOT, 'dist')), snapshot(join(ROOT, 'api', '_generated'))]
  // --no-serve: the loop lives in build + watch, so no server (and no port) is needed.
  const proc = Bun.spawn(['bun', join(ROOT, 'app', 'dev.ts'), '--no-serve'], {
    cwd: ROOT,
    env: { ...process.env, VAULT_PATH: vault, SOII_OUT_DIR: out },
    stdout: 'pipe',
    stderr: 'pipe'
  })
  let output = ''
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder()
    const reader = stream.getReader()
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) output += decoder.decode(chunk.value)
  }
  void pump(proc.stdout)
  void pump(proc.stderr)
  const builds = () => output.split(/soii: \d+ notes/).length - 1
  const rebuilds = () => output.split('rebuilding…').length - 1
  const waitFor = async (done: () => boolean, ms: number) => {
    const until = Date.now() + ms
    while (!done() && Date.now() < until) await sleep(100)
    return done()
  }

  try {
    expect(await waitFor(() => builds() >= 1, 30_000)).toBe(true)
    await sleep(3000)
    expect(rebuilds()).toBe(0) // an idle dev server never rebuilds by itself

    writeFileSync(join(vault, 'Notes', 'One.md'), '---\ntype: note\n---\nSecond version.\n')
    expect(await waitFor(() => rebuilds() >= 1, 10_000)).toBe(true)
    await sleep(4000)
    expect(rebuilds()).toBe(1) // one edit, one rebuild
    expect(builds()).toBe(2) // the first build plus that rebuild
  } finally {
    proc.kill('SIGINT')
    await proc.exited
  }

  expect(existsSync(join(out, 'dist', 'index.html'))).toBe(true)
  expect(existsSync(join(out, 'api', '_generated', 'vault', 'index.json'))).toBe(true)
  expect([snapshot(join(ROOT, 'dist')), snapshot(join(ROOT, 'api', '_generated'))]).toEqual(worktreeBefore)
}, 60_000)
