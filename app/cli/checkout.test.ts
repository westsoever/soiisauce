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
