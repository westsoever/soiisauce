import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyAttachments } from './attachments'

const base = mkdtempSync(join(tmpdir(), 'soii-attach-'))
afterAll(() => rmSync(base, { recursive: true, force: true }))

test('copies each referenced attachment under its NFC path', () => {
  const vault = join(base, 'v1')
  mkdirSync(join(vault, 'A'), { recursive: true })
  writeFileSync(join(vault, 'A', 'x.pdf'), 'pdf')
  copyAttachments(vault, join(base, 'out1'), ['A/x.pdf'])
  expect(readFileSync(join(base, 'out1', 'files', 'A', 'x.pdf'), 'utf8')).toBe('pdf')
})

// On macOS, copyFileSync of a file over ~128 KB makes the file watcher report a change on the SOURCE. soii rebuilds
// on every vault change and copies attachments on every build, so one big linked PDF restarted it in an endless loop.
test('copying a big attachment is not reported as a change to the vault', async () => {
  const vault = join(base, 'v2')
  mkdirSync(join(vault, 'A'), { recursive: true })
  writeFileSync(join(vault, 'A', 'big.pdf'), Buffer.alloc(500_000, 7))
  await Bun.sleep(500)
  const events: string[] = []
  const w = watch(vault, { recursive: true }, (_e, f) => events.push(String(f)))
  await Bun.sleep(300)
  try {
    for (let i = 0; i < 2; i++) copyAttachments(vault, join(base, 'out2'), ['A/big.pdf'])
    await Bun.sleep(1000)
    expect(events).toEqual([])
    expect(readFileSync(join(base, 'out2', 'files', 'A', 'big.pdf')).length).toBe(500_000)
  } finally {
    w.close()
  }
})
