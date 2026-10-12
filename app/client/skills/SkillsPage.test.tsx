import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SkillMeta, VaultIndex } from '../../lib/types'
import { SkillsPage } from './SkillsPage'

const skill = (id: string, description: string, soii = true): SkillMeta => ({ id, name: id, description, soii })
const page = (skills: SkillMeta[] | undefined) => renderToStaticMarkup(<SkillsPage index={{ skills } as unknown as VaultIndex} />)

const SKILLS = [
  skill('soii-health', 'Weekly vault check-up for soii. Finds notes soii cannot read. Use when the owner asks for a health check.'),
  skill('soii-wrap', 'End-of-session wrap-up. Use at the end of a session, when the owner says "wrap up" or "log this session".'),
  skill('soii-setup', 'Make an Obsidian vault readable by soii. Use when someone has just installed soii.'),
  skill('soii-brandnew', 'A skill the page has never heard of. Use when testing.'),
  skill('my-own', 'My own thing. Use when I need it.', false)
]

describe('SkillsPage', () => {
  test('opens with the one line that says where to type these', () => {
    expect(page(SKILLS)).toContain('Type these in Claude Code, inside your vault.')
  })

  test('shows the groups in order: jobs, More, then Your skills', () => {
    const html = page(SKILLS)
    const order = ['Start &amp; setup', 'Keep healthy', 'Capture &amp; save', 'More', 'Your skills'].map(t => html.indexOf(`>${t}<`))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).not.toContain('>Think &amp; connect<')
  })

  test('each skill shows its command, its one-line summary, and when to use it', () => {
    const html = page(SKILLS)
    expect(html).toContain('/soii-health')
    expect(html).toContain('Weekly vault check-up for soii.')
    expect(html).not.toContain('Finds notes soii cannot read')
    expect(html).toContain('Use when you ask for a health check')
    expect(html).toContain('“wrap up”')
    expect(html).toContain('“log this session”')
  })

  test('every command has a copy button named for what it copies', () => {
    const html = page(SKILLS)
    expect(html).toContain('aria-label="Copy /soii-health"')
    expect(html).toContain('aria-label="Copy /my-own"')
  })

  test('a skill soii ships that the page has not placed still shows, under More', () => {
    const html = page(SKILLS)
    expect(html.indexOf('/soii-brandnew')).toBeGreaterThan(html.indexOf('>More<'))
    expect(html.indexOf('/soii-brandnew')).toBeLessThan(html.indexOf('>Your skills<'))
  })

  test("the owner's skills come last, in Your skills", () => {
    const html = page(SKILLS)
    expect(html.indexOf('/my-own')).toBeGreaterThan(html.indexOf('>Your skills<'))
  })

  test('ends with the soii commands for the terminal, each copyable', () => {
    const html = page(SKILLS)
    expect(html).toContain('soii in the terminal')
    for (const c of ['soii start', 'soii stop', 'soii status', 'soii open', 'soii logs', 'soii update', 'soii check']) {
      expect(html).toContain(`aria-label="Copy ${c}"`)
    }
    expect(html.indexOf('soii in the terminal')).toBeGreaterThan(html.indexOf('>Your skills<'))
  })

  test('a vault with no skills says how to get some, and still lists the terminal commands', () => {
    const html = page([])
    expect(html).toContain('No skills in this vault yet')
    expect(html).toContain('soii install')
    expect(html).toContain('/skillfactory')
    expect(html).toContain('soii in the terminal')
    expect(page(undefined)).toContain('No skills in this vault yet')
  })

  test('the header counts the skills', () => {
    expect(page(SKILLS)).toContain('5 skills')
    expect(page([SKILLS[0]])).toContain('1 skill<')
  })

  test('descriptions are text, never markup', () => {
    const html = page([skill('soii-x', 'Says <img src=x onerror=alert(1)> hello. Use when <b>bold</b>.')])
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
  })
})
