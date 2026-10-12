// app/lib/format.test.ts
import { describe, expect, test } from 'bun:test'
import { formatCurrency, formatDate, parseLooseNumber } from './format'

describe('parseLooseNumber', () => {
  const cases: [unknown, number | null][] = [
    [25, 25],
    ['25,00 kr.', 25],
    ['$96.00', 96],
    ['~645 kr.', 645],
    ['72.5', 72.5],
    ['0,5', 0.5],
    ['1,234', 1234],
    ['1.234', 1234],
    ['1.234.567', 1234567],
    ['1,234,567', 1234567],
    ['1.234,56 €', 1234.56],
    ['1,234.56', 1234.56],
    ['12.345,6', 12345.6],
    ['-12,50', -12.5],
    ['EUR 29,40/mo', 29.4],
    // a lone "ddd" group is thousands only after 1–3 non-zero-led integer digits
    ['0.500', 0.5],
    ['0,500', 0.5],
    ['-0.125', -0.125],
    ['-0,125', -0.125],
    ['1234.567', 1234.567],
    ['12.345', 12345],
    ['123,456', 123456],
    // a leading separator is a decimal mark
    ['.5', 0.5],
    [',5', 0.5],
    ['.500', 0.5],
    ['-.5', -0.5],
    ['$.75', 0.75],
    ['ca.25 kr', 25],
    ['ca.2,50', 2.5],
    // repeated separators must be well-formed thousands groups; anything else is not a number
    ['v2.5.1', null],
    ['1.2.3', null],
    ['10.0.0.1', null],
    ['1.234.56', null],
    ['1,234,5678', null],
    ['1.2,3.4', null],
    ['abc', null],
    ['', null],
    [true, null],
    [null, null],
    [Number.NaN, null]
  ]
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} → ${expected}`, () => expect(parseLooseNumber(input)).toBe(expected))
  }
})

describe('formatDate', () => {
  test('short and long styles, no timezone shift', () => {
    expect(formatDate('2026-10-06', 'short')).toBe('6 Oct 2026')
    expect(formatDate('2026-10-06', 'long')).toBe('Tuesday, 6 October 2026')
    expect(formatDate('2026-10-06T22:30:00Z', 'short')).toBe('6 Oct 2026')
  })
  test('anything unparseable is returned unchanged', () => {
    expect(formatDate('someday', 'short')).toBe('someday')
  })
})

describe('formatCurrency', () => {
  test('ISO codes use Intl, other units are appended', () => {
    expect(formatCurrency(25, 'DKK')).toContain('25.00')
    expect(formatCurrency(25, 'dkk')).toContain('DKK')
    expect(formatCurrency(25, 'kr')).toBe('25 kr')
    expect(formatCurrency(1234.5)).toBe('1,234.5')
  })
})
