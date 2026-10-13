// The checkout of soii inside .soii/, driven with real git against a local "remote" repo.
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkoutSoii, installedRef } from './checkout'
import { realCtx } from './context'

const root = mkdtempSync(join(tmpdir(), 'soii-checkout-'))
const remote = join(root, 'remote')
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' }).trim()
const ctx = { ...realCtx(), env: { ...process.env, SOII_REMOTE: remote } }

beforeAll(() => {
  mkdirSync(remote)
  git(remote, 'init', '-q')
  writeFileSync(join(remote, 'package.json'), '{"name":"soii","version":"0.1.0"}')
  writeFileSync(join(remote, 'marker.txt'), 'one')
  git(remote, 'add', '-A')
  git(remote, 'commit', '-q', '-m', 'one')
  git(remote, 'tag', 'v0.1.0')
  writeFileSync(join(remote, 'marker.txt'), 'two')
  git(remote, 'commit', '-q', '-am', 'two')
  git(remote, 'tag', 'v0.2.0')
  git(remote, 'branch', 'feature')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

test('checks out the pinned tag into <vault>/.soii/soii', async () => {
  const vault = join(root, 'v1')
  const r = await checkoutSoii(ctx, vault, 'v0.1.0')
  expect(r).toEqual({ ok: true, changed: true })
  expect(readFileSync(join(vault, '.soii', 'soii', 'marker.txt'), 'utf8')).toBe('one')
  expect(await installedRef(ctx, vault)).toBe('v0.1.0')
})

test('is a no-op when the tag is already there', async () => {
  const vault = join(root, 'v2')
  await checkoutSoii(ctx, vault, 'v0.1.0')
  writeFileSync(join(vault, '.soii', 'soii', 'untouched'), 'x')
  expect(await checkoutSoii(ctx, vault, 'v0.1.0')).toEqual({ ok: true, changed: false })
  expect(existsSync(join(vault, '.soii', 'soii', 'untouched'))).toBe(true)
})

test('moving the pin swaps the checkout', async () => {
  const vault = join(root, 'v3')
  await checkoutSoii(ctx, vault, 'v0.1.0')
  expect(await checkoutSoii(ctx, vault, 'v0.2.0')).toEqual({ ok: true, changed: true })
  expect(readFileSync(join(vault, '.soii', 'soii', 'marker.txt'), 'utf8')).toBe('two')
  expect(existsSync(join(vault, '.soii', 'soii.old'))).toBe(false)
  expect(existsSync(join(vault, '.soii', 'soii.new'))).toBe(false)
})

test('a branch is checked out fresh every time', async () => {
  const vault = join(root, 'v4')
  expect(await checkoutSoii(ctx, vault, 'feature')).toEqual({ ok: true, changed: true })
  expect(await checkoutSoii(ctx, vault, 'feature')).toEqual({ ok: true, changed: true })
})

test('an unknown ref fails and leaves the working install alone', async () => {
  const vault = join(root, 'v5')
  await checkoutSoii(ctx, vault, 'v0.1.0')
  const r = await checkoutSoii(ctx, vault, 'v9.9.9')
  expect(r.ok).toBe(false)
  expect(readFileSync(join(vault, '.soii', 'soii', 'marker.txt'), 'utf8')).toBe('one')
  expect(existsSync(join(vault, '.soii', 'soii.new'))).toBe(false)
})

test('a folder in the way that is not a soii checkout is never deleted', async () => {
  const vault = join(root, 'v6')
  mkdirSync(join(vault, '.soii', 'soii'), { recursive: true })
  writeFileSync(join(vault, '.soii', 'soii', 'precious.txt'), 'mine')
  const r = await checkoutSoii(ctx, vault, 'v0.1.0')
  expect(r.ok).toBe(false)
  expect(readFileSync(join(vault, '.soii', 'soii', 'precious.txt'), 'utf8')).toBe('mine')
})

// ---- packages are installed before the swap, so .soii/soii never holds a tree the CLI can't start from ----

test('prepare runs on the new copy, before it is swapped in, with the old install still in place', async () => {
  const vault = join(root, 'v7')
  await checkoutSoii(ctx, vault, 'v0.1.0')
  const seen: { dir: string; marker: string; liveMarker: string }[] = []
  const r = await checkoutSoii(ctx, vault, 'v0.2.0', async dir => {
    seen.push({ dir, marker: readFileSync(join(dir, 'marker.txt'), 'utf8'), liveMarker: readFileSync(join(vault, '.soii', 'soii', 'marker.txt'), 'utf8') })
    writeFileSync(join(dir, 'installed.txt'), 'packages')
    return true
  })
  expect(r).toEqual({ ok: true, changed: true })
  expect(seen).toEqual([{ dir: join(vault, '.soii', 'soii.new'), marker: 'two', liveMarker: 'one' }])
  expect(readFileSync(join(vault, '.soii', 'soii', 'installed.txt'), 'utf8')).toBe('packages')
  expect(readFileSync(join(vault, '.soii', 'soii', 'marker.txt'), 'utf8')).toBe('two')
})

test('prepare failing keeps the old install, removes the new copy and says so', async () => {
  const vault = join(root, 'v8')
  await checkoutSoii(ctx, vault, 'v0.1.0')
  writeFileSync(join(vault, '.soii', 'soii', 'node_modules-stand-in'), 'old packages')
  const r = await checkoutSoii(ctx, vault, 'v0.2.0', async () => false)
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.message).toMatch(/packages.*not (been )?(installed|put in place)|nothing was changed/i)
  expect(readFileSync(join(vault, '.soii', 'soii', 'marker.txt'), 'utf8')).toBe('one')
  expect(readFileSync(join(vault, '.soii', 'soii', 'node_modules-stand-in'), 'utf8')).toBe('old packages')
  expect(await installedRef(ctx, vault)).toBe('v0.1.0')
  expect(existsSync(join(vault, '.soii', 'soii.new'))).toBe(false)
  expect(existsSync(join(vault, '.soii', 'soii.old'))).toBe(false)
})

test('prepare failing on a first install leaves no .soii/soii at all', async () => {
  const vault = join(root, 'v9')
  const r = await checkoutSoii(ctx, vault, 'v0.1.0', async () => false)
  expect(r.ok).toBe(false)
  expect(existsSync(join(vault, '.soii', 'soii'))).toBe(false)
  expect(existsSync(join(vault, '.soii', 'soii.new'))).toBe(false)
})

test('prepare is not called when the tag is already there', async () => {
  const vault = join(root, 'v10')
  await checkoutSoii(ctx, vault, 'v0.1.0')
  let calls = 0
  expect(await checkoutSoii(ctx, vault, 'v0.1.0', async () => { calls++; return true })).toEqual({ ok: true, changed: false })
  expect(calls).toBe(0)
})
