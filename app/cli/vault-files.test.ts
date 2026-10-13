import { expect, test } from 'bun:test'
import { ensureLines, parsePin, pinSpec, renderSoiiPackageJson, setPin, SOII_GITIGNORE_LINES } from './vault-files'

test('the pin spec points at the tag on GitHub', () => {
  expect(pinSpec('v0.1.0')).toBe('github:westsoever/soii#v0.1.0')
  expect(pinSpec('0.1.0')).toBe('github:westsoever/soii#v0.1.0')
})

test('a branch or other ref is kept as it is', () => {
  expect(pinSpec('feat/soii-local')).toBe('github:westsoever/soii#feat/soii-local')
})

test('parsePin reads the ref out of the soii dependency', () => {
  expect(parsePin('{"dependencies":{"soii":"github:westsoever/soii#v0.1.0"}}')).toBe('v0.1.0')
  expect(parsePin('{"dependencies":{"soii":"github:westsoever/soii#feat/x"}}')).toBe('feat/x')
})

test('parsePin is null when there is no pin or no ref', () => {
  expect(parsePin('{"dependencies":{}}')).toBeNull()
  expect(parsePin('{"dependencies":{"soii":"github:westsoever/soii"}}')).toBeNull()
  expect(parsePin('{nope')).toBeNull()
})

test('a fresh .soii/package.json is private and pins soii', () => {
  expect(JSON.parse(renderSoiiPackageJson('github:westsoever/soii#v0.1.0'))).toEqual({
    private: true,
    dependencies: { soii: 'github:westsoever/soii#v0.1.0' }
  })
})

test('setPin changes only the soii dependency and keeps everything else', () => {
  const before = JSON.stringify({ private: true, name: 'mine', dependencies: { soii: 'github:westsoever/soii#v0.1.0', other: '^1.0.0' } }, null, 2)
  const after = JSON.parse(setPin(before, 'github:westsoever/soii#v0.2.0'))
  expect(after).toEqual({ private: true, name: 'mine', dependencies: { soii: 'github:westsoever/soii#v0.2.0', other: '^1.0.0' } })
})

test('setPin adds the dependency when it is missing', () => {
  expect(JSON.parse(setPin('{"private":true}', 'github:westsoever/soii#v0.2.0'))).toEqual({
    private: true,
    dependencies: { soii: 'github:westsoever/soii#v0.2.0' }
  })
})

test('setPin on invalid JSON throws a message naming the file', () => {
  expect(() => setPin('{nope', 'x')).toThrow(/\.soii\/package\.json/)
})

test('the .gitignore covers install, build output, logs and secrets', () => {
  for (const line of ['soii/', 'build/', 'logs/', 'cache/', '.env.local', 'node_modules/']) expect(SOII_GITIGNORE_LINES).toContain(line)
})

test('ensureLines appends only what is missing and never duplicates', () => {
  const once = ensureLines('node_modules/\n', ['node_modules/', 'build/'])
  expect(once).toBe('node_modules/\nbuild/\n')
  expect(ensureLines(once, ['node_modules/', 'build/'])).toBe(once)
})

test('ensureLines handles a missing trailing newline and an empty file', () => {
  expect(ensureLines('a', ['b'])).toBe('a\nb\n')
  expect(ensureLines('', ['b'])).toBe('b\n')
})
