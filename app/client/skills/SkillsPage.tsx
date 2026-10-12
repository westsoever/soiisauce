// app/client/skills/SkillsPage.tsx
// /skills: the Claude Code skills in the vault, grouped by job, each with the command that calls it, and the soii
// commands for the terminal. The skills come from the vault's own `.claude/skills` at build time (index.skills), so
// the ones the owner makes with /skillfactory show up too.
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CLI_COMMANDS, groupSkills, type SkillView } from '../../lib/skills'
import type { VaultIndex } from '../../lib/types'
import { toast } from '../lib/toast'
import { Button } from '../ui/button'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied', 'success')
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      toast("Couldn't copy.", 'error')
    }
  }
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy ${text}`} title={`Copy ${text}`} onClick={() => void copy()}>
      {copied ? <IconCheck stroke={1.75} /> : <IconCopy stroke={1.75} />}
    </Button>
  )
}

// Same chip as inline code elsewhere (EmptyTab).
function CommandChip({ text }: { text: string }) {
  return <code className="rounded-xs bg-accent px-1.5 py-0.5 font-mono text-xs text-foreground select-all">{text}</code>
}

function When({ skill }: { skill: SkillView }) {
  const when = skill.when
  if (!when) return null
  const text = 'phrases' in when ? `Triggered by ${when.phrases.map(p => `“${p}”`).join(', ')}` : `Use ${when.text}`
  return <span className="block text-xs text-muted-foreground">{text}</span>
}

function SkillRow({ skill }: { skill: SkillView }) {
  return (
    <li className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-accent">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span>
          <CommandChip text={skill.command} />
        </span>
        {skill.summary && <span className="block text-sm">{skill.summary}</span>}
        <When skill={skill} />
      </div>
      <CopyButton text={skill.command} />
    </li>
  )
}

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`skills-${id}`} className="flex flex-col gap-0.5">
      <h2 id={`skills-${id}`} className="mb-1 px-2 text-xs font-medium text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  )
}

export function SkillsPage({ index }: { index: VaultIndex }) {
  const groups = useMemo(() => groupSkills(index.skills), [index.skills])
  const count = groups.reduce((n, g) => n + g.skills.length, 0)
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-2 md:h-12 md:px-3">
        <h1 className="px-2 text-base font-medium md:text-sm">Skills</h1>
        <span className="text-xs text-muted-foreground tabular-nums">{count === 1 ? '1 skill' : `${count} skills`}</span>
      </header>
      <main className="min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
          <p className="px-2 text-sm text-muted-foreground">Type these in Claude Code, inside your vault.</p>
          {groups.length === 0 && (
            <p className="px-2 text-sm text-muted-foreground">
              No skills in this vault yet. <CommandChip text="soii install" /> copies soii&apos;s skills into <CommandChip text=".claude/skills" />, and <CommandChip text="/skillfactory" /> turns a process of yours into a new one.
            </p>
          )}
          {groups.map(group => (
            <Group key={group.id} id={group.id} title={group.title}>
              {group.skills.map(skill => (
                <SkillRow key={skill.id} skill={skill} />
              ))}
            </Group>
          ))}
          <Group id="terminal" title="soii in the terminal">
            {CLI_COMMANDS.map(c => (
              <li key={c.command} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="sm:w-32 sm:shrink-0">
                    <CommandChip text={c.command} />
                  </span>
                  <span className="text-sm text-muted-foreground">{c.what}</span>
                </div>
                <CopyButton text={c.command} />
              </li>
            ))}
          </Group>
        </div>
      </main>
    </div>
  )
}
