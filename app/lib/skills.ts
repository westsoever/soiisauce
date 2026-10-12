// app/lib/skills.ts
// The Skills page's logic, shared by the build (parsing SKILL.md) and the client (summaries, grouping).
import { parse } from 'yaml'
import type { SkillMeta } from './types'

/** name and description out of a SKILL.md's frontmatter. Never throws: a skill with odd frontmatter is still a skill. */
export function parseSkillMd(text: string, folder: string): { name: string; description: string } {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1]
  if (block === undefined) return { name: folder, description: '' }
  let name: unknown
  let description: unknown
  try {
    const data = parse(block)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      name = (data as Record<string, unknown>).name
      description = (data as Record<string, unknown>).description
    }
  } catch {
    // Unquoted ": " in a description is not valid YAML but is common; read it line by line below.
  }
  const line = (key: string) => new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(block)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2')
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
  return { name: clean(name) || line('name') || folder, description: clean(description) || clean(line('description')) }
}

export type SkillWhen = { phrases: string[] } | { text: string } | null

export interface SkillView {
  id: string
  name: string
  command: string
  summary: string
  when: SkillWhen
  soii: boolean
}

const TRIGGER = /\bUse (when|whenever|at|this when|it when|after)\b/i
const SENTENCE = /^(.+?(?<!e\.g)(?<!i\.e)[.!?])(?:\s|$)/s

const firstSentence = (text: string): string => SENTENCE.exec(text)?.[1] ?? text

function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`
}

// The descriptions are written about "the owner"; the page talks to them. "their" only changes where it belongs to the owner.
function toYou(text: string): string {
  const aboutOwner = /\bthe owner\b/i.test(text)
  const spoken = text
    .replace(/\bthe owner's\b/gi, 'your')
    .replace(/\bthe owner is\b/gi, "you're")
    .replace(/\bthe owner has\b/gi, 'you have')
    .replace(/\bthe owner (asks|says|wants|types|picks|hands|makes|points|keeps|uses|needs|reports|pastes)\b/gi, (_m, verb: string) => `you ${verb.slice(0, -1)}`)
    .replace(/\bthe owner\b/gi, 'you')
  return aboutOwner ? spoken.replace(/\btheir\b/gi, 'your') : spoken
}

const plain = (text: string): string => text.replace(/`/g, '')

/** At most two items of a comma list, so a long trigger ends on an item and not mid-phrase. */
function firstItems(text: string): string {
  const second = text.indexOf(',', text.indexOf(',') + 1)
  return text.indexOf(',') >= 0 && second >= 0 ? `${text.slice(0, second)}…` : text
}

export function describeSkill(skill: SkillMeta): SkillView {
  const description = skill.description.trim()
  const at = description.search(TRIGGER)
  const head = at >= 0 ? description.slice(0, at) : description
  const summary = shorten(toYou(plain(firstSentence(head.trim()).trim())), 160)

  let when: SkillWhen = null
  if (at >= 0) {
    const trigger = description.slice(at)
    const phrases = [...trigger.matchAll(/["“]([^"”]+)["”]/g)].map(m => m[1].trim()).filter(q => q && !q.startsWith('/'))
    if (phrases.length > 0) when = { phrases: phrases.slice(0, 4) }
    else {
      // "Use when x" -> "when x"; "Use at x" -> "at x". Only the first sentence, in words addressed to the owner.
      const clause = firstSentence(trigger.replace(/^Use\s+/i, '').replace(/^(this|it) when\b/i, 'when')).replace(/[.!?]$/, '').trim()
      when = { text: shorten(firstItems(toYou(plain(clause))), 140) }
    }
  }
  return { id: skill.id, name: skill.name, command: `/${skill.name}`, summary, when, soii: skill.soii }
}

export interface SkillGroup {
  id: string
  title: string
  skills: SkillView[]
}

// soii's own skills by job, in the order the page shows them. A new skill soii ships lands in "More" until it is placed here.
const JOBS: { id: string; title: string; skills: string[] }[] = [
  { id: 'start', title: 'Start & setup', skills: ['soii-intro', 'soii-setup', 'soii-update', 'soii-sync-fix', 'soii-install'] },
  { id: 'health', title: 'Keep healthy', skills: ['soii-health'] },
  { id: 'capture', title: 'Capture & save', skills: ['soii-capture', 'soii-save', 'soii-wrap'] },
  { id: 'think', title: 'Think & connect', skills: ['soii-chat', 'soii-synthesize', 'soii-panel'] },
  { id: 'learn', title: 'Learn & explore', skills: ['soii-learn', 'soii-explore'] },
  { id: 'make', title: 'Make your own', skills: ['skillfactory'] },
  // Not installed into vaults; it shows when the page runs against soii's own skills (a dev run).
  { id: 'maintain', title: 'Maintain soii', skills: ['soii-release'] }
]

const byId = (a: SkillMeta, b: SkillMeta) => a.id.localeCompare(b.id)

export function groupSkills(skills: SkillMeta[] | undefined): SkillGroup[] {
  const all = skills ?? []
  const ours = all.filter(s => s.soii)
  const placed = new Set(JOBS.flatMap(j => j.skills))
  const groups: SkillGroup[] = JOBS.map(job => ({
    id: job.id,
    title: job.title,
    skills: job.skills.flatMap(id => ours.filter(s => s.id === id)).map(describeSkill)
  }))
  groups.push({ id: 'more', title: 'More', skills: ours.filter(s => !placed.has(s.id)).sort(byId).map(describeSkill) })
  groups.push({ id: 'own', title: 'Your skills', skills: all.filter(s => !s.soii).sort(byId).map(describeSkill) })
  return groups.filter(g => g.skills.length > 0)
}

/** The terminal commands the page lists at the bottom. */
export const CLI_COMMANDS: { command: string; what: string }[] = [
  { command: 'soii start', what: "Start soii if it isn't running." },
  { command: 'soii stop', what: 'Stop soii until you start it again or log in.' },
  { command: 'soii status', what: 'Is it running? Which vault, version and address.' },
  { command: 'soii open', what: 'Open soii in your browser.' },
  { command: 'soii logs', what: 'Show the log (add -f to follow it).' },
  { command: 'soii update', what: 'Move to the newest release and restart.' },
  { command: 'soii check', what: "Check your notes' properties and structure." }
]
