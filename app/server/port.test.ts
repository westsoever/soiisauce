// app/server/port.test.ts
import { describe, expect, test } from 'bun:test'
import { DEFAULT_PORT, readPort } from './port'

describe('readPort', () => {
  test('uses PORT when it is a valid port', () => {
    expect(readPort({ PORT: '5011' })).toBe(5011)
    expect(readPort({ PORT: ' 8080 ' })).toBe(8080)
  })

  test('an empty, blank or missing PORT means the default, not a random port', () => {
    expect(readPort({ PORT: '' })).toBe(DEFAULT_PORT)
    expect(readPort({ PORT: '   ' })).toBe(DEFAULT_PORT)
    expect(readPort({})).toBe(DEFAULT_PORT)
  })

  test('nonsense falls back to the default', () => {
    for (const PORT of ['abc', '0', '-1', '70000', '12.5']) expect(readPort({ PORT })).toBe(DEFAULT_PORT)
  })
})

describe('readPort in local mode', () => {
  test('SOII_LOCAL=1 defaults to 5011, an explicit PORT still wins', () => {
    expect(readPort({ SOII_LOCAL: '1' })).toBe(5011)
    expect(readPort({ SOII_LOCAL: '1', PORT: '' })).toBe(5011)
    expect(readPort({ SOII_LOCAL: '1', PORT: '6000' })).toBe(6000)
    expect(readPort({ SOII_LOCAL: '1', PORT: 'abc' })).toBe(5011)
  })

  test('without SOII_LOCAL the dev default is unchanged', () => {
    expect(readPort({ SOII_LOCAL: '0' })).toBe(DEFAULT_PORT)
  })
})
