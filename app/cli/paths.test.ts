import { expect, test } from 'bun:test'
import { chooseShimDir, logPath, pathInstruction, plistPath, renderShim, shimCandidates } from './paths'

test('the shim goes in ~/.bun/bin when that is on PATH', () => {
  expect(chooseShimDir({ home: '/h', pathEnv: '/usr/bin:/h/.bun/bin:/h/.local/bin', exists: () => true })).toEqual({ dir: '/h/.bun/bin', onPath: true })
})

test('otherwise ~/.local/bin when that is on PATH', () => {
  expect(chooseShimDir({ home: '/h', pathEnv: '/usr/bin:/h/.local/bin', exists: () => true })).toEqual({ dir: '/h/.local/bin', onPath: true })
})

test('a PATH directory that does not exist is not used', () => {
  expect(chooseShimDir({ home: '/h', pathEnv: '/h/.bun/bin:/h/.local/bin', exists: d => d === '/h/.local/bin' })).toEqual({ dir: '/h/.local/bin', onPath: true })
})

test('with neither on PATH it falls back to ~/.local/bin and says it is not on PATH', () => {
  expect(chooseShimDir({ home: '/h', pathEnv: '/usr/bin', exists: () => false })).toEqual({ dir: '/h/.local/bin', onPath: false })
})

test('trailing slashes in PATH entries still match', () => {
  expect(chooseShimDir({ home: '/h', pathEnv: '/h/.bun/bin/', exists: () => true })).toEqual({ dir: '/h/.bun/bin', onPath: true })
})

test('log and plist locations', () => {
  expect(logPath('darwin', '/h')).toBe('/h/Library/Logs/soii.log')
  expect(logPath('linux', '/h')).toBe('/h/.local/state/soii/soii.log')
  expect(plistPath('/h')).toBe('/h/Library/LaunchAgents/com.soii.server.plist')
})

test('the shim execs the vault-pinned CLI with quoted paths', () => {
  const sh = renderShim({ bun: "/Users/me/.bun/bin/bun", script: "/Users/me/my vault/.soii/node_modules/soii/bin/soii.ts" })
  expect(sh.startsWith('#!/bin/sh\n')).toBe(true)
  expect(sh).toContain('# soii shim')
  expect(sh).toContain(`exec '/Users/me/.bun/bin/bun' '/Users/me/my vault/.soii/node_modules/soii/bin/soii.ts' "$@"`)
})

test('single quotes in a path are escaped for sh', () => {
  const sh = renderShim({ bun: '/b/bun', script: "/Users/o'brien/v/bin/soii.ts" })
  expect(sh).toContain(`'/Users/o'\\''brien/v/bin/soii.ts'`)
})

test('a Homebrew bin folder that is on PATH and writable is used when the usual ones are not on PATH', () => {
  const o = { home: '/h', pathEnv: '/usr/bin:/opt/homebrew/bin', exists: () => true }
  expect(chooseShimDir({ ...o, writable: () => true })).toEqual({ dir: '/opt/homebrew/bin', onPath: true })
  expect(chooseShimDir({ ...o, writable: () => false })).toEqual({ dir: '/h/.local/bin', onPath: false })
})

test('the usual folders still win over Homebrew\'s', () => {
  expect(chooseShimDir({ home: '/h', pathEnv: '/opt/homebrew/bin:/h/.local/bin', exists: () => true, writable: () => true }).dir).toBe('/h/.local/bin')
})

test('every folder a shim can be put in is one uninstall cleans', () => {
  expect(shimCandidates('/h')).toEqual(['/h/.bun/bin', '/h/.local/bin', '/h/bin', '/opt/homebrew/bin', '/usr/local/bin'])
})

test('the PATH instruction names the shell\'s own startup file', () => {
  const base = { dir: '/h/.local/bin', home: '/h' }
  expect(pathInstruction({ ...base, shell: '/bin/zsh', platform: 'darwin' })).toContain(`>> ~/.zshrc`)
  expect(pathInstruction({ ...base, shell: '/bin/bash', platform: 'linux' })).toContain(`>> ~/.bashrc`)
  expect(pathInstruction({ ...base, shell: '/usr/bin/fish', platform: 'linux' })).toContain('fish_add_path "$HOME/.local/bin"')
  expect(pathInstruction({ ...base, shell: '', platform: 'linux' })).toContain('startup file')
  expect(pathInstruction({ dir: '/opt/tools', home: '/h', shell: '/bin/zsh', platform: 'darwin' })).toContain('export PATH="/opt/tools:$PATH"')
})
