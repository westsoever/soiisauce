// `soii run` end to end: builds into <vault>/.soii/build, serves on loopback, recompiles when a note changes,
// and does not rebuild because of its own output (which lives inside the vault).
import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeRegistry } from './registry'

const ROOT = join(import.meta.dir, '..', '..')
const base = mkdtempSync(join(tmpdir(), 'soii-run-'))
const vault = join(base, 'vault')
const config = join(base, 'config')
afterAll(() => rmSync(base, { recursive: true, force: true }))

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const freePort = () =>
  new Promise<number>(resolve => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

test('soii run serves the vault, picks up a new note, and stays quiet otherwise', async () => {
  mkdirSync(join(vault, 'Notes'), { recursive: true })
  mkdirSync(join(vault, '.soii'), { recursive: true })
  writeFileSync(join(vault, 'Notes', 'One.md'), '---\ntype: note\n---\nFirst.\n')
  // The checkout is the repo itself: same layout as <vault>/.soii/soii.
  symlinkSync(ROOT, join(vault, '.soii', 'soii'))
  const port = await freePort()
  writeRegistry(config, { vault, port })

  const proc = Bun.spawn(['bun', join(ROOT, 'bin', 'soii.ts'), 'run'], {
    cwd: join(vault, '.soii'),
    env: { ...process.env, SOII_CONFIG_DIR: config, PORT: '', SOII_LOCAL: '', VAULT_PATH: '' },
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
  const noteCount = async (): Promise<number | null> => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/vault`)
      return res.ok ? ((await res.json()) as { notes: unknown[] }).notes.length : null
    } catch {
      return null
    }
  }
  const waitFor = async (done: () => Promise<boolean>, ms: number) => {
    const until = Date.now() + ms
    while (Date.now() < until) {
      if (await done()) return true
      await sleep(200)
    }
    return false
  }

  try {
    expect(await waitFor(async () => (await noteCount()) === 1, 60_000)).toBe(true)
    expect(output).toContain('(local mode)')

    writeFileSync(join(vault, 'Notes', 'Two.md'), '---\ntype: note\n---\nSecond.\n')
    expect(await waitFor(async () => (await noteCount()) === 2, 30_000)).toBe(true)

    // Quiet: the recompile wrote into .soii/build and .soii/ is not watched, so no further rebuilds follow.
    const rebuilds = () => output.split('recompiling the vault').length - 1
    const seen = rebuilds()
    await sleep(2500)
    expect(rebuilds()).toBe(seen)
    expect(seen).toBeGreaterThanOrEqual(1)

    // Dot-folders (Obsidian's .obsidian, soii's .soii, .git) don't trigger anything.
    mkdirSync(join(vault, '.obsidian'), { recursive: true })
    writeFileSync(join(vault, '.obsidian', 'workspace.json'), '{}')
    await sleep(1500)
    expect(rebuilds()).toBe(seen)
  } finally {
    proc.kill()
    await proc.exited
  }
}, 120_000)
