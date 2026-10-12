// app/lib/property-edit.test.ts
import { describe, expect, test } from 'bun:test'
import { setProperty } from './property-edit'

const NOTE = [
  '---',
  'type: person',
  'relationship: friend # how we know each other',
  'company: "Acme"',
  'zip: 007',
  'flag: yes',
  'related: [Anna, Bob] # flow',
  'roles:',
  '  - founder',
  '  - advisor',
  'email:',
  'updated: 2026-01-01',
  '---',
  '# Marvin',
  '',
  'Body stays.',
  ''
].join('\n')

const front = (s: string) => s.slice(0, s.indexOf('\n---\n', 4) + 5)

describe('setProperty', () => {
  test('changes one scalar and leaves every other byte alone, comment included', () => {
    const r = setProperty(NOTE, 'relationship', 'close friend')
    expect(r).toEqual({ ok: true, content: NOTE.replace('relationship: friend #', 'relationship: close friend #') })
  })

  test('keeps the quote style of a quoted string', () => {
    const r = setProperty(NOTE, 'company', 'Initech')
    expect(r.ok && r.content).toBe(NOTE.replace('company: "Acme"', 'company: "Initech"'))
  })

  test('quotes what would otherwise change meaning', () => {
    const r = setProperty(NOTE, 'relationship', '[[Anna]]')
    expect(r.ok && r.content).toContain('relationship: "[[Anna]]" # how we know each other\n')
    const n = setProperty(NOTE, 'relationship', '5')
    expect(n.ok && n.content).toContain('relationship: "5" #')
  })

  test('fills an empty value and clears one back to a bare key', () => {
    const filled = setProperty(NOTE, 'email', 'marvin@example.com')
    expect(filled.ok && filled.content).toBe(NOTE.replace('email:\n', 'email: marvin@example.com\n'))
    const cleared = setProperty(NOTE, 'relationship', null)
    expect(cleared.ok && cleared.content).toBe(NOTE.replace('relationship: friend #', 'relationship: #'))
    const company = setProperty(NOTE, 'company', null)
    expect(company.ok && company.content).toBe(NOTE.replace('company: "Acme"\n', 'company:\n'))
  })

  test('writes numbers and booleans as YAML numbers and booleans', () => {
    const r = setProperty(NOTE, 'rating', 4)
    expect(r.ok && front(r.content)).toContain('\nrating: 4\n---\n')
    const b = setProperty(NOTE, 'flag', false)
    expect(b.ok && b.content).toBe(NOTE.replace('flag: yes', 'flag: false'))
  })

  test('replaces a block list as a block list', () => {
    const r = setProperty(NOTE, 'roles', ['founder', 'board member'])
    expect(r.ok && r.content).toBe(NOTE.replace('  - founder\n  - advisor\n', '  - founder\n  - board member\n'))
  })

  test('replaces a flow list as a flow list and keeps its comment', () => {
    const r = setProperty(NOTE, 'related', ['Anna', '[[Cleo]]'])
    expect(r.ok && r.content).toBe(NOTE.replace('related: [Anna, Bob] # flow', 'related: [Anna, "[[Cleo]]"] # flow'))
  })

  test('turns a scalar into a list and a list into a scalar', () => {
    const r = setProperty(NOTE, 'relationship', ['friend', 'colleague'])
    expect(r.ok && r.content).toContain('relationship:\n  - friend\n  - colleague\ncompany:')
    const s = setProperty(NOTE, 'roles', 'founder')
    expect(s.ok && s.content).toContain('roles: founder\nemail:')
  })

  test('adds a new key at the end of the frontmatter', () => {
    const r = setProperty(NOTE, 'birthday', '1990-05-01')
    expect(r.ok && r.content).toBe(NOTE.replace('updated: 2026-01-01\n---', 'updated: 2026-01-01\nbirthday: 1990-05-01\n---'))
    const list = setProperty(NOTE, 'circle', ['climbing'])
    expect(list.ok && list.content).toContain('updated: 2026-01-01\ncircle:\n  - climbing\n---')
  })

  test('sets updated when the note keeps one, unless updated is the property being edited', () => {
    const r = setProperty(NOTE, 'relationship', 'mentor', { updated: '2026-10-12' })
    expect(r.ok && r.content).toContain('updated: 2026-10-12\n')
    const own = setProperty(NOTE, 'updated', '2025-12-24', { updated: '2026-10-12' })
    expect(own.ok && own.content).toContain('updated: 2025-12-24\n')
    const none = setProperty('---\na: 1\n---\n', 'a', 2, { updated: '2026-10-12' })
    expect(none.ok && none.content).toBe('---\na: 2\n---\n')
  })

  test('creates frontmatter for a note without any', () => {
    expect(setProperty('# Marvin\n', 'type', 'person')).toEqual({ ok: true, content: '---\ntype: person\n---\n# Marvin\n' })
    expect(setProperty('---\n---\n# M\n', 'type', 'person')).toEqual({ ok: true, content: '---\ntype: person\n---\n# M\n' })
  })

  test('keeps CRLF line endings and a BOM', () => {
    const crlf = '﻿---\r\na: x\r\nb: y\r\n---\r\n# T\r\n'
    expect(setProperty(crlf, 'a', 'z')).toEqual({ ok: true, content: '﻿---\r\na: z\r\nb: y\r\n---\r\n# T\r\n' })
  })

  test('refuses frontmatter it cannot read, and changes nothing', () => {
    for (const src of ['---\na: [unclosed\n---\n', '---\n- a list\n---\n', '---\na: 1\na: 2\n---\n']) {
      expect(setProperty(src, 'a', 'x')).toEqual({ ok: false, reason: 'unreadable' })
    }
  })

  test('a key that needs quoting is written quoted and read back', () => {
    const r = setProperty('---\na: 1\n---\n', 'Due date', '2026-11-01')
    expect(r.ok && r.content).toBe('---\na: 1\nDue date: 2026-11-01\n---\n')
  })
})
