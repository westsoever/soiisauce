import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { CLI_COMMANDS, describeSkill, groupSkills, parseSkillMd } from './skills'
import type { SkillMeta } from './types'

const skill = (id: string, description = 'Does a thing. Use when you want it.', soii = true): SkillMeta => ({ id, name: id, description, soii })

describe('parseSkillMd', () => {
  test('reads name and description from the frontmatter', () => {
    const md = '---\nname: soii-health\ndescription: Weekly vault check-up. Use when asked.\n---\n\n# Body\n'
    expect(parseSkillMd(md, 'soii-health')).toEqual({ name: 'soii-health', description: 'Weekly vault check-up. Use when asked.' })
  })

  test('the folder name stands in for a missing name', () => {
    expect(parseSkillMd('---\ndescription: x\n---\n', 'my-skill')).toEqual({ name: 'my-skill', description: 'x' })
  })

  test('a file with no frontmatter is still a skill, with no description', () => {
    expect(parseSkillMd('# Just text\n', 'plain')).toEqual({ name: 'plain', description: '' })
  })

  test('folded and quoted YAML descriptions work', () => {
    expect(parseSkillMd('---\nname: a\ndescription: >\n  one\n  two\n---\n', 'a').description).toBe('one two')
    expect(parseSkillMd('---\nname: a\ndescription: "Has: a colon"\n---\n', 'a').description).toBe('Has: a colon')
  })

  test('a description that is not valid YAML (an unquoted ": ") is read line by line instead of dropped', () => {
    const md = '---\nname: soii-demo\ndescription: Walk through it end to end: GitHub access, then the rest. Use when asked.\n---\n'
    expect(parseSkillMd(md, 'soii-demo')).toEqual({ name: 'soii-demo', description: 'Walk through it end to end: GitHub access, then the rest. Use when asked.' })
  })

  test('CRLF files parse', () => {
    expect(parseSkillMd('---\r\nname: a\r\ndescription: b\r\n---\r\n', 'a')).toEqual({ name: 'a', description: 'b' })
  })
})

describe('describeSkill: the one-sentence summary', () => {
  const summary = (description: string) => describeSkill(skill('x', description)).summary

  test('is the first sentence', () => {
    expect(summary('Weekly vault check-up for soii. Finds notes soii cannot read. Use when asked.')).toBe('Weekly vault check-up for soii.')
  })

  test('stops before "Use when" when there is no sentence end', () => {
    expect(summary('Chat with your vault Use when the owner asks')).toBe('Chat with your vault')
  })

  test('does not split on e.g. or i.e.', () => {
    expect(summary('Finds things, e.g. papers and talks. Use when asked.')).toBe('Finds things, e.g. papers and talks.')
  })

  test('is shortened to about 160 characters at a word boundary', () => {
    const long = `${'word '.repeat(60)}end.`
    const s = summary(long)
    expect(s.length).toBeLessThanOrEqual(161)
    expect(s.endsWith('…')).toBe(true)
    expect(s).not.toMatch(/\s…$/)
  })

  test('the summary speaks to you, not about "the owner"', () => {
    expect(summary("Bring soii into the owner's vault, keeping their notes. Use when asked.")).toBe('Bring soii into your vault, keeping your notes.')
    expect(summary('Chat with the vault. Use when asked.')).toBe('Chat with the vault.')
  })

  test('backticks are dropped from the summary', () => {
    expect(summary('Runs `soii update` for you. Use when asked.')).toBe('Runs soii update for you.')
  })

  test('an empty description gives an empty summary', () => {
    expect(summary('')).toBe('')
  })
})

describe('describeSkill: when to use it', () => {
  const when = (description: string) => describeSkill(skill('x', description)).when

  test('quoted trigger phrases become a short list', () => {
    expect(when('Does it. Use when the owner says "wrap up", "wrap this session" or types /soii-wrap.')).toEqual({ phrases: ['wrap up', 'wrap this session'] })
  })

  test('at most four phrases, curly quotes too, slash commands never', () => {
    const d = 'Does it. Use when the owner says "a", “b”, "c", "d", "e", or types "/x".'
    expect(when(d)).toEqual({ phrases: ['a', 'b', 'c', 'd'] })
  })

  test('without quotes it is the clause after "Use when", in plain words to you', () => {
    expect(when('Does it. Use when the owner asks for a vault health check, or when a routine runs it.')).toEqual({
      text: 'when you ask for a vault health check, or when a routine runs it'
    })
  })

  test('"the owner" becomes "you" with the verb following', () => {
    const text = (d: string) => (when(d) as { text: string }).text
    expect(text('X. Use when the owner says it is broken.')).toBe('when you say it is broken')
    expect(text('X. Use when the owner wants a tour.')).toBe('when you want a tour')
    expect(text('X. Use when the owner has a new idea.')).toBe('when you have a new idea')
    expect(text('X. Use when the owner is unsure.')).toBe("when you're unsure")
    expect(text('X. Use when the owner types /soii-intro.')).toBe('when you type /soii-intro')
    expect(text('X. Use when notes by the owner pile up.')).toBe('when notes by you pile up')
  })

  test('a long list of triggers is cut after the second comma, so it ends on an item, not mid-phrase', () => {
    expect(when('X. Use when the owner asks for a check, a fix-up, or a report, or when it runs.')).toEqual({ text: 'when you ask for a check, a fix-up…' })
    expect(when('X. Use when a, b.')).toEqual({ text: 'when a, b' })
  })

  test('backticks around commands are dropped', () => {
    expect(when('X. Use when `soii status` says a newer release is out.')).toEqual({ text: 'when soii status says a newer release is out' })
  })

  test('the clause stops at the sentence end and is shortened', () => {
    expect((when('X. Use when something happens. Not for other things.') as { text: string }).text).toBe('when something happens')
    const long = (when(`X. Use when ${'many words '.repeat(30)}.`) as { text: string }).text
    expect(long.length).toBeLessThanOrEqual(141)
    expect(long.endsWith('…')).toBe(true)
  })

  test('"Use at …" is a trigger too, with its own wording kept', () => {
    expect(when('X. Use at the end of a session, when the owner says "wrap up".')).toEqual({ phrases: ['wrap up'] })
    expect((when('X. Use at the end of a session.') as { text: string }).text).toBe('at the end of a session')
  })

  test('no trigger text means null', () => {
    expect(when('Just a sentence with no trigger.')).toBeNull()
    expect(when('')).toBeNull()
  })
})

describe('describeSkill: the rest', () => {
  test('the command is the name with a slash', () => {
    expect(describeSkill(skill('soii-health')).command).toBe('/soii-health')
  })
})

describe('groupSkills', () => {
  const ids = (g: { skills: { id: string }[] }) => g.skills.map(s => s.id)

  test('soii skills fall into their jobs, in the planned order', () => {
    const all = ['soii-wrap', 'skillfactory', 'soii-learn', 'soii-chat', 'soii-health', 'soii-sync-fix', 'soii-setup', 'soii-intro', 'soii-panel', 'soii-synthesize', 'soii-capture', 'soii-save', 'soii-explore', 'unbox'].map(id => skill(id))
    const groups = groupSkills(all)
    expect(groups.map(g => g.title)).toEqual(['Start & setup', 'Keep healthy', 'Capture & save', 'Think & connect', 'Learn & explore', 'Make your own'])
    expect(groups.map(ids)).toEqual([
      ['soii-intro', 'soii-setup', 'soii-sync-fix'],
      ['soii-health'],
      ['soii-capture', 'unbox', 'soii-save', 'soii-wrap'],
      ['soii-chat', 'soii-synthesize', 'soii-panel'],
      ['soii-learn', 'soii-explore'],
      ['skillfactory']
    ])
  })

  test('the maintainer skill soii-release has a group of its own, so it never falls into More', () => {
    const groups = groupSkills([skill('soii-health'), skill('soii-release')])
    expect(groups.map(g => g.title)).toEqual(['Keep healthy', 'Maintain soii'])
    expect(ids(groups[1])).toEqual(['soii-release'])
  })

  test('empty groups are left out', () => {
    expect(groupSkills([skill('soii-health')]).map(g => g.title)).toEqual(['Keep healthy'])
  })

  test('a soii skill the page has never heard of goes in More, so a new skill never disappears', () => {
    const groups = groupSkills([skill('soii-health'), skill('soii-zeta'), skill('soii-alpha')])
    expect(groups.map(g => g.title)).toEqual(['Keep healthy', 'More'])
    expect(ids(groups[1])).toEqual(['soii-alpha', 'soii-zeta'])
  })

  test("the owner's own skills come last, as Your skills, sorted by name", () => {
    const groups = groupSkills([skill('mine-b', 'x', false), skill('soii-health'), skill('mine-a', 'x', false), skill('soii-zeta')])
    expect(groups.map(g => g.title)).toEqual(['Keep healthy', 'More', 'Your skills'])
    expect(ids(groups[2])).toEqual(['mine-a', 'mine-b'])
  })

  test("an owner's skill named like a soii one is still theirs", () => {
    const groups = groupSkills([skill('soii-health', 'x', false)])
    expect(groups.map(g => g.title)).toEqual(['Your skills'])
  })

  test('no skills, no groups', () => {
    expect(groupSkills([])).toEqual([])
    expect(groupSkills(undefined)).toEqual([])
  })

  test('skills carry their described view', () => {
    const [g] = groupSkills([skill('soii-health', 'Weekly check. Use when the owner asks.')])
    expect(g.skills[0]).toMatchObject({ id: 'soii-health', command: '/soii-health', summary: 'Weekly check.', soii: true })
  })
})

describe('CLI_COMMANDS', () => {
  test('lists the terminal commands from the plan, each with a short line', () => {
    expect(CLI_COMMANDS.map(c => c.command)).toEqual(['soii start', 'soii stop', 'soii status', 'soii open', 'soii logs', 'soii update', 'soii check'])
    for (const c of CLI_COMMANDS) expect(c.what.length).toBeGreaterThan(10)
  })
})

describe('the skills soii ships', () => {
  const dir = join(import.meta.dir, '..', '..', '.claude', 'skills')
  const names = existsSync(dir) ? readdirSync(dir) : []

  test('every one has frontmatter that is valid YAML with a name that matches its folder and a description', () => {
    expect(names.length).toBeGreaterThan(0)
    for (const folder of names) {
      const text = readFileSync(join(dir, folder, 'SKILL.md'), 'utf8')
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
      const parsed = parse(block) as { name?: string; description?: string }
      expect({ folder, name: parsed.name }).toEqual({ folder, name: folder })
      expect(typeof parsed.description).toBe('string')
      expect(parsed.description?.length).toBeGreaterThan(20)
    }
  })

  test('there is no /soii-update skill: `soii update` in a terminal is the one way to update (D105)', () => {
    expect(names).not.toContain('soii-update')
  })

  test('every one of them lands in a named group, not only in More', () => {
    const metas = names.map(folder => {
      const { name, description } = parseSkillMd(readFileSync(join(dir, folder, 'SKILL.md'), 'utf8'), folder)
      return { id: folder, name, description, soii: true }
    })
    const more = groupSkills(metas).find(g => g.title === 'More')
    expect(more?.skills.map(s => s.id) ?? []).toEqual([])
  })
})
