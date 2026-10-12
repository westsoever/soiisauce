import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runEnv } from './run'

const dirs: string[] = []
const root = (pkg: string | null) => {
  const d = mkdtempSync(join(tmpdir(), 'soii-runenv-'))
  dirs.push(d)
  mkdirSync(d, { recursive: true })
  if (pkg !== null) writeFileSync(join(d, 'package.json'), pkg)
  return d
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const opts = (soiiRoot: string) => ({ vault: '/v', port: 5011, soiiRoot, outDir: '/v/.soii/build', cwd: '/v/.soii' })

test('the service learns which release it is from the installed package.json', () => {
  expect(runEnv(opts(root('{"name":"soii","version":"0.1.3"}'))).SOII_VERSION).toBe('0.1.3')
})

test('an unreadable package.json leaves the version empty rather than stopping the service', () => {
  expect(runEnv(opts(root(null))).SOII_VERSION).toBe('')
  expect(runEnv(opts(root('{nope'))).SOII_VERSION).toBe('')
})

test('local mode, the vault, the port and the loopback host are set', () => {
  expect(runEnv(opts(root('{"version":"0.1.3"}')))).toMatchObject({ SOII_LOCAL: '1', VAULT_PATH: '/v', PORT: '5011', HOST: '127.0.0.1', SOII_OUT_DIR: '/v/.soii/build' })
})
