import { afterEach, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PORT, configDir, readRegistry, removeRegistry, writeRegistry } from './registry'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'soii-reg-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

test('the default port is 5011', () => {
  expect(DEFAULT_PORT).toBe(5011)
})

test('configDir is ~/.config/soii unless SOII_CONFIG_DIR says otherwise', () => {
  expect(configDir({ HOME: '/home/me' })).toBe('/home/me/.config/soii')
  expect(configDir({ HOME: '/home/me', SOII_CONFIG_DIR: '/tmp/x' })).toBe('/tmp/x')
})

test('nothing registered reads as null', () => {
  expect(readRegistry(tmp())).toBeNull()
})

test('a registry round-trips, creating the folder on the way', () => {
  const dir = join(tmp(), 'nested', 'soii')
  writeRegistry(dir, { vault: '/Users/me/cos', port: 5011 })
  expect(readRegistry(dir)).toEqual({ vault: '/Users/me/cos', port: 5011 })
  expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))).toEqual({ vault: '/Users/me/cos', port: 5011 })
})

test('a corrupt registry is an error that names the file, not a crash on undefined', () => {
  const dir = tmp()
  writeFileSync(join(dir, 'config.json'), '{nope')
  expect(() => readRegistry(dir)).toThrow(/config\.json/)
})

test('a registry without a vault is rejected', () => {
  const dir = tmp()
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ port: 5011 }))
  expect(() => readRegistry(dir)).toThrow(/vault/)
})

test('a registry without a valid port falls back to the default', () => {
  const dir = tmp()
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ vault: '/v', port: 'x' }))
  expect(readRegistry(dir)).toEqual({ vault: '/v', port: 5011 })
})

test('removeRegistry deletes only config.json', () => {
  const dir = tmp()
  writeRegistry(dir, { vault: '/v', port: 5011 })
  removeRegistry(dir)
  expect(existsSync(join(dir, 'config.json'))).toBe(false)
  expect(() => removeRegistry(dir)).not.toThrow()
})
