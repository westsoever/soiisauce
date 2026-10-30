// Capacity (D129): how full the week is against the line you want to run at, what makes it up,
// whether one more project fits, and the one number a day ("How full was today?"). The maths is
// in app/lib/capacity.ts; this file renders it and writes the daily number to the settings note.
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  computeAdvice,
  computeCapacity,
  computeOutlook,
  CapacityOptionsSchema,
  pct,
  withFelt,
  type Advice,
  type CapacityResult,
  type InputResult,
  type Outlook
} from '../../lib/capacity'
import { formatDate } from '../../lib/format'
import { localDay } from '../../lib/log'
import { notePath } from '../../lib/paths'
import { readField } from '../../lib/read-field'
import { findNote, parentName } from '../../lib/subprojects'
import type { NoteId, NoteMeta, ViewProps } from '../../lib/types'
import { useCapabilities } from '../lib/queries'
import { toast } from '../lib/toast'
import { builtAt, waitForRebuild } from '../lib/use-fresh-vault'
import { postProperty } from '../reader/PropertyEditor'
import { Button } from '../ui/button'
import { cn } from '../ui/utils'
import { OptionsError } from './cells'

const FELT_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const RECENT_DAYS = 7
/** Felt (× 10) and the computed score this far apart is worth a look. */
const GAP = 20

export function CapacityView({ tab, notes, index, openNote }: ViewProps) {
  const parsed = useMemo(() => CapacityOptionsSchema.safeParse(tab.options ?? {}), [tab.options])
  const today = localDay()
  const result = useMemo(() => (parsed.success ? computeCapacity(parsed.data, notes, index, today) : null), [parsed, notes, index, today])

  const outlook = useMemo(() => (parsed.success && result ? computeOutlook(result, parsed.data, today) : null), [parsed, result, today])
  const advice = useMemo(() => (result && outlook ? computeAdvice(result, outlook) : null), [result, outlook])

  if (!parsed.success || !result || !outlook || !advice) return <OptionsError view="capacity" error={parsed.error!} />

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 max-md:px-3">
      <LoadPanel result={result} outlook={outlook} />
      <Causes result={result} outlook={outlook} advice={advice} openNote={openNote} />
      <Actions result={result} advice={advice} openNote={openNote} />
      <Inputs inputs={result.inputs} openNote={openNote} />
      <NewProject result={result} notes={index.notes} openNote={openNote} />
      <FeltToday result={result} today={today} />
      <SettingsLine settings={result.settings} openNote={openNote} />
    </div>
  )
}

function stateLine({ state, total, target, ceiling }: CapacityResult): string {
  if (state === 'under') return `Under the ${target}% line, with ${pct(target - total)} to spare.`
  if (state === 'sprint') return `Above the ${target}% line. Fine for a short push; plan the way back to ${target}%.`
  return `Over capacity by ${pct(total - ceiling)}. Say no to new work, and finish, pause or drop something.`
}

function outlookLine({ weekEnd, projected }: Outlook, target: number): string {
  const by = formatDate(weekEnd, 'short')
  if (projected <= target) return `On track: ${pct(projected)} by ${by}, with ${pct(target - projected)} to spare.`
  return `${pct(projected)} by ${by}: ${pct(projected - target)} above the ${target}% line.`
}

function MeterRow(props: {
  name: string
  value: number
  state: CapacityResult['state']
  result: CapacityResult
  scale: number
  expected?: boolean
}) {
  const { name, value, state, result, scale, expected } = props
  const at = (n: number) => `${Math.min(100, (n / scale) * 100)}%`
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{name}</span>
        <span className="text-2xl font-medium tabular-nums">{pct(value)}</span>
      </div>
      <div
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={Math.round(scale)}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${pct(value)}, line at ${result.target}%`}
        className="relative h-2 w-full rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', state === 'over' ? 'bg-destructive' : 'bg-primary', expected && 'opacity-50')}
          style={{ width: at(value) }}
        />
        <span aria-hidden className="absolute -top-1 -bottom-1 w-px bg-foreground" style={{ left: at(result.target) }} />
        <span aria-hidden className="absolute -top-1 -bottom-1 w-px bg-muted-foreground" style={{ left: at(result.ceiling) }} />
      </div>
    </div>
  )
}

export function LoadPanel({ result, outlook }: { result: CapacityResult; outlook?: Outlook }) {
  const { total, target, ceiling, state } = result
  // The bar runs to a quarter past full capacity, or further when the load is higher still.
  const scale = Math.max(ceiling * 1.25, total * 1.05, (outlook?.projected ?? 0) * 1.05)
  const at = (n: number) => `${Math.min(100, (n / scale) * 100)}%`
  return (
    <section aria-label="Load" className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-xs max-md:p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-xs text-muted-foreground">Load this week</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Line {target}% · full {ceiling}%
        </span>
      </div>
      <MeterRow name="Now" value={total} state={state} result={result} scale={scale} />
      {outlook && (
        <MeterRow name={`Expected by ${formatDate(outlook.weekEnd, 'short')}`} value={outlook.projected} state={outlook.state} result={result} scale={scale} expected />
      )}
      <div aria-hidden className="relative h-4 text-xs text-muted-foreground tabular-nums">
        <span className="absolute -translate-x-1/2" style={{ left: at(target) }}>
          {target}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: at(ceiling) }}>
          {ceiling}
        </span>
      </div>
      <p className="text-sm">{stateLine(result)}</p>
      {outlook && <p className="text-sm text-muted-foreground">{outlookLine(outlook, target)}</p>}
    </section>
  )
}

export function Causes({ result, outlook, advice, openNote }: { result: CapacityResult; outlook: Outlook; advice: Advice; openNote: (id: NoteId) => void }) {
  const { total, target } = result
  const gap = total - target
  return (
    <section className="flex flex-col gap-2 px-1">
      <h3 className="flex h-8 items-center text-sm font-medium">What is causing this</h3>
      <p className="text-sm">
        {gap > 0
          ? `${pct(total)} now, ${pct(gap)} above the ${target}% line. Most of it comes from:`
          : `${pct(total)} now, ${pct(-gap)} under the ${target}% line. The biggest inputs are:`}
      </p>
      <ul className="flex flex-col text-sm">
        {advice.causes.map(cause => (
          <li key={cause.label} className="flex items-baseline justify-between gap-3 py-0.5">
            <span>{cause.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {pct(cause.points)} · {Math.round(cause.share * 100)}% of the load
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">By {formatDate(outlook.weekEnd, 'short')}, assuming only what your notes say:</p>
      {outlook.steps.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing is dated in the rest of the week and no input is assumed cleared, so the load stays where it is. Meetings, the fixed load and accepted leaks are not projected.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {outlook.steps.map(step => (
            <li key={`${step.kind}-${step.input}`}>
              <span className="tabular-nums">−{pct(step.points)}</span>{' '}
              {step.kind === 'clear' ? `${step.label}: filed by the end of the week (assumed).` : `${step.label}: dated in the rest of the week, so finished.`}
              {step.kind === 'due' && <NoteLinks notes={step.notes} openNote={openNote} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function Actions({ result, advice, openNote }: { result: CapacityResult; advice: Advice; openNote: (id: NoteId) => void }) {
  const { target } = result
  if (advice.over <= 0) {
    return (
      <section className="flex flex-col gap-1 px-1">
        <h3 className="flex h-8 items-center text-sm font-medium">To stay under {target}%</h3>
        <p className="text-sm">Nothing to cut: the week is expected to end under the line.</p>
      </section>
    )
  }
  const last = advice.actions.at(-1)
  return (
    <section className="flex flex-col gap-2 px-1">
      <h3 className="flex h-8 items-center text-sm font-medium">To reach {target}% by the end of the week</h3>
      {advice.actions.length === 0 ? (
        <p className="text-sm">There are no notes or hours left to cut from the inputs soii can advise on. Lower a weight or the fixed load, or move something out of the week.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {advice.actions.map((action, i) => (
            <li key={`${action.input}-${i}`} className="flex items-start gap-3 py-2">
              <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1 text-sm">
                {action.label}
                {action.notes.length > 0 && <NoteLinks notes={action.notes} openNote={openNote} />}
              </div>
              <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                −{pct(action.points)} → {pct(action.after)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {last && (
        <p className="text-xs text-muted-foreground">
          {advice.reaches
            ? `Doing these lands the week at ${pct(last.after)}.`
            : `Even all of this leaves ${pct(last.after)}, ${pct(last.after - target)} above the line: a project has to pause or a date has to move.`}
        </p>
      )}
    </section>
  )
}

function amountText(input: InputResult): string {
  if (input.amount === null) return '–'
  const unit = input.unit === '%' ? '%' : input.unit ? ` ${input.unit}` : ''
  const amount = `${Math.round(input.amount * 10) / 10}${unit}`
  if (input.unit === '%' && input.weight === 1) return amount
  // Notes that carry their own number (a project's load:, a leak's cost:) have no single weight to show.
  if (input.ownNumbers === input.amount) return String(input.amount)
  if (input.ownNumbers > 0) return `${input.amount}, ${input.ownNumbers} own`
  return `${amount} × ${pct(input.weight)}`
}

function missingText(input: InputResult): string | null {
  if (input.missing === 'no-note') return 'Not counted: there is no note with type: capacity.'
  if (input.missing === 'no-value') return `Not counted: the capacity note has no ${input.id === 'base' ? 'base' : 'value for this'} yet.`
  if (input.missing === 'stale') return `Not counted: the last entry (${formatDate(input.asOf!, 'short')}) is too old.`
  return null
}

export function Inputs({ inputs, openNote }: { inputs: InputResult[]; openNote: (id: NoteId) => void }) {
  return (
    <section className="flex flex-col">
      <h3 className="flex h-8 items-center px-1 text-sm font-medium">What makes it up</h3>
      <ul className="flex flex-col divide-y divide-border">
        {inputs.map(input => {
          const missing = missingText(input)
          return (
            <li key={input.id} className="flex items-start gap-3 px-1 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm">{input.label}</div>
                {input.hint && <div className="text-xs text-muted-foreground">{input.hint}</div>}
                {missing && <div className="text-xs text-muted-foreground">{missing}</div>}
                {input.asOf && !missing && <div className="text-xs text-muted-foreground">As of {formatDate(input.asOf, 'short')}</div>}
                {input.notes.length > 0 && <NoteLinks notes={input.notes} openNote={openNote} />}
              </div>
              <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums max-md:w-20">{amountText(input)}</span>
              <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">{input.points === null ? '–' : pct(input.points)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const SHOWN_LINKS = 6

function NoteLinks({ notes, openNote }: { notes: NoteMeta[]; openNote: (id: NoteId) => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? notes : notes.slice(0, SHOWN_LINKS)
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {shown.map((note, i) => (
        <span key={note.id}>
          <a
            href={notePath(note.id)}
            onClick={e => {
              e.preventDefault()
              openNote(note.id)
            }}
            className="rounded-sm underline decoration-border underline-offset-2 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {note.title}
          </a>
          {i < shown.length - 1 && ', '}
        </span>
      ))}
      {notes.length > SHOWN_LINKS && (
        <Button variant="ghost" size="xs" className="ml-1" onClick={() => setAll(v => !v)}>
          {all ? 'Show fewer' : `and ${notes.length - SHOWN_LINKS} more`}
        </Button>
      )}
    </div>
  )
}

export function NewProject({ result, notes, openNote }: { result: CapacityResult; notes: NoteMeta[]; openNote: (id: NoteId) => void }) {
  const next = result.newProject
  if (!next) return null
  const { total, target, ceiling } = result
  const move = `${pct(total)} → ${pct(next.after)}`
  const answer =
    next.verdict === 'yes'
      ? `Yes, it fits: ${move}, under the ${target}% line.`
      : next.verdict === 'sprint'
        ? `Only as a short push: ${move}, above the ${target}% line. Give it an end date and say what pauses until then.`
        : `Not now: ${move}, over ${ceiling}%. Finish, pause or drop something first.`
  // The settings note can point at the checklist that decides it: checklist: "[[New project - yes or no]]".
  const name = result.settings ? parentName({ parent: readField(result.settings, 'checklist') }) : null
  const checklist = name ? findNote(notes, name) : undefined
  return (
    <section className="flex flex-col gap-1 px-1">
      <h3 className="flex h-8 items-center text-sm font-medium">A new project?</h3>
      <p className="text-sm">{answer}</p>
      <p className="text-xs text-muted-foreground">One more project adds about {pct(next.cost)}. The weight is an estimate: a small one may cost less.</p>
      {checklist && (
        <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => openNote(checklist.id)}>
          Go through {checklist.title}
        </Button>
      )}
    </section>
  )
}

function FeltToday({ result, today }: { result: CapacityResult; today: string }) {
  const capabilities = useCapabilities()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState<number | null>(null)
  const settings = result.settings
  const todays = result.felt.find(e => e.date === today)?.value ?? null
  const recent = result.felt.slice(-RECENT_DAYS).reverse()
  const latest = result.felt.at(-1)
  const gap = latest && latest.score !== null ? Math.round(latest.value * 10 - latest.score) : null
  const canWrite = !!settings && capabilities.data?.write === true

  const save = async (value: number) => {
    if (!settings || saving !== null) return
    setSaving(value)
    try {
      const before = await builtAt()
      const list = withFelt(readField(settings, 'felt'), today, value, result.total)
      const saved = await postProperty(queryClient, settings, 'felt', list)
      const extra = saved.warning && !saved.warning.startsWith('Committed') ? ` ${saved.warning}` : ''
      toast(`Saved ${value} for today.${extra}`, extra ? 'info' : 'success')
      void waitForRebuild(queryClient, before)
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save today's number.", 'error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="flex flex-col gap-2 px-1">
      <div className="flex flex-col">
        <h3 className="flex h-8 items-center text-sm font-medium">How full was today?</h3>
        <p className="text-xs text-muted-foreground">One number a day, 1 to 10. 8 is the line; 10 is flat out.</p>
      </div>
      <div className="grid grid-cols-10 gap-1 md:flex md:flex-wrap" role="group" aria-label="How full was today, 1 to 10">
        {FELT_CHOICES.map(n => (
          <Button
            key={n}
            size="sm"
            variant={todays === n ? 'secondary' : 'ghost'}
            aria-pressed={todays === n}
            disabled={!canWrite || saving !== null}
            onClick={() => void save(n)}
            className="w-full px-0 tabular-nums md:w-9"
          >
            {n}
          </Button>
        ))}
      </div>
      {!settings && <p className="text-xs text-muted-foreground">Add a note with type: capacity to keep this number. soii writes it there as felt:.</p>}
      {settings && capabilities.data && !capabilities.data.write && (
        <p className="text-xs text-muted-foreground">soii can't write to this vault, so add the number to felt: on the capacity note.</p>
      )}
      {recent.length > 0 && (
        <ul className="flex flex-col text-xs text-muted-foreground tabular-nums">
          {recent.map(entry => (
            <li key={entry.date} className="flex gap-3">
              <span className="w-24 shrink-0">{formatDate(entry.date, 'short')}</span>
              <span className="w-14 shrink-0">felt {entry.value}</span>
              {entry.score !== null && <span>score {pct(entry.score)}</span>}
            </li>
          ))}
        </ul>
      )}
      {gap !== null && Math.abs(gap) >= GAP && (
        <p className="text-xs text-muted-foreground">
          {`The last day felt ${Math.abs(gap)} points ${gap > 0 ? 'fuller' : 'emptier'} than the score. If that holds for a few days, change a weight or log a leak.`}
        </p>
      )}
    </section>
  )
}

function SettingsLine({ settings, openNote }: { settings: NoteMeta | null; openNote: (id: NoteId) => void }) {
  if (!settings) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Meeting hours, a fixed load and your own weights go on a note with type: capacity (meetings:, base:, weight_projects:, target:).
      </p>
    )
  }
  return (
    <p className="px-1 text-xs text-muted-foreground">
      Weights, meeting hours and the line are on{' '}
      <button
        type="button"
        onClick={() => openNote(settings.id)}
        className="rounded-sm underline decoration-border underline-offset-2 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {settings.title}
      </button>
      .
    </p>
  )
}
