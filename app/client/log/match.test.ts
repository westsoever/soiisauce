// app/client/log/match.test.ts
import { describe, expect, test } from 'bun:test'
import { kindById, type LogKind } from '../../lib/log'
import type { NoteMeta } from '../../lib/types'
import { candidatesFor, detailFor, fold } from './match'

const note = (title: string, extra: Partial<NoteMeta> = {}): NoteMeta => ({
  id: title,
  title,
  path: `${title}.md`,
  folder: '',
  type: 'person',
  tags: [],
  date: null,
  updated: null,
  frontmatter: {},
  excerpt: '',
  image: null,
  wordCount: 1,
  ...extra
})
const conversation = kindById('conversation') as LogKind
const noteKind = kindById('note') as LogKind
const NOTES = [
  note('Anna', { lastSeen: '2026-10-01', frontmatter: { relationship: 'friend' } }),
  note('Annika Vale', { lastSeen: '2026-09-01' }),
  note('Hanna Berg', { lastSeen: '2026-10-10' }),
  note('Bálint'),
  note('Dune', { type: 'book', updated: '2026-10-11', frontmatter: { author: 'Frank Herbert', status: 'reading' } })
]

describe('candidatesFor', () => {
  test('no query: that kind only, most recently seen first', () => {
    expect(candidatesFor(conversation, NOTES, '').map(n => n.title)).toEqual(['Hanna Berg', 'Anna', 'Annika Vale', 'Bálint'])
  })

  test('prefix beats word start beats substring; accents and case are ignored', () => {
    expect(candidatesFor(conversation, NOTES, 'ann').map(n => n.title)).toEqual(['Anna', 'Annika Vale', 'Hanna Berg'])
    expect(candidatesFor(conversation, NOTES, 'berg').map(n => n.title)).toEqual(['Hanna Berg'])
    expect(candidatesFor(conversation, NOTES, 'BALI').map(n => n.title)).toEqual(['Bálint'])
  })

  test('Note searches every note', () => {
    expect(candidatesFor(noteKind, NOTES, 'dun').map(n => n.title)).toEqual(['Dune'])
  })

  test('limit', () => {
    expect(candidatesFor(conversation, NOTES, '', 2)).toHaveLength(2)
  })
})

test('fold and detailFor', () => {
  expect(fold('  Bálint  Ø ')).toBe('balint ø')
  expect(detailFor(NOTES[0])).toBe('friend')
  expect(detailFor(NOTES[4])).toBe('Frank Herbert · reading')
})
