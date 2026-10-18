// app/client/speed/SpeedReader.tsx
// /speed: paste a text, set the words per minute, and read it one word at a time in the same spot. One letter of each
// word (the pivot) is held in a fixed column and highlighted, so the eye never has to move.
import { IconMinus, IconPlayerPause, IconPlayerPlay, IconPlus, IconRotate } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { readJson, storageKeys, writeJson } from '../lib/storage'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Progress } from '../ui/progress'
import { Textarea } from '../ui/textarea'
import { clampWpm, DEFAULT_WPM, formatDuration, MAX_WPM, MIN_WPM, secondsLeft, splitAtPivot, splitWords, wordDelay } from './speed-read'

const WPM_STEP = 50

function Word({ word }: { word: string | undefined }) {
  if (word === undefined) return <p className="text-sm text-muted-foreground">Paste a text below to start.</p>
  const { before, pivot, after } = splitAtPivot(word)
  return (
    <div className="flex flex-col items-center gap-1">
      <span aria-hidden className="h-3 w-px bg-border" />
      {/* The pivot sits alone in the middle column, so it stays put while the rest of the word grows to either side. */}
      <p className="grid w-full grid-cols-[1fr_auto_1fr] items-baseline text-3xl tabular-nums">
        <span className="min-w-0 text-right break-all">{before}</span>
        <span className="font-medium text-primary">{pivot}</span>
        <span className="min-w-0 text-left break-all">{after}</span>
      </p>
      <span aria-hidden className="h-3 w-px bg-border" />
    </div>
  )
}

export function SpeedReader() {
  const [text, setText] = useState('')
  const [wpm, setWpm] = useState(() => clampWpm(readJson(storageKeys.speedWpm, DEFAULT_WPM)))
  const [wpmDraft, setWpmDraft] = useState(() => String(wpm))
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const words = useMemo(() => splitWords(text), [text])
  const last = words.length - 1

  const chooseWpm = useCallback((value: number) => {
    setWpm(value)
    setWpmDraft(String(value))
    writeJson(storageKeys.speedWpm, value)
  }, [])

  const toggle = useCallback(() => {
    if (words.length === 0) return
    // Pressing play on the last word reads the text again from the top.
    if (!playing && position >= last) setPosition(0)
    setPlaying(p => !p)
  }, [words.length, playing, position, last])

  const step = useCallback((by: number) => setPosition(p => Math.min(Math.max(0, last), Math.max(0, p + by))), [last])

  // One timer per word: it moves on to the next word after that word's delay, and stops after the last one.
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => {
      if (position >= last) setPlaying(false)
      else setPosition(position + 1)
    }, wordDelay(words[position] ?? '', wpm))
    return () => clearTimeout(timer)
  }, [playing, position, last, words, wpm])

  // Space starts and pauses; the arrows step. Left alone while a field or button has focus, which use those keys themselves.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || target?.closest('input, textarea, select, button, [contenteditable]')) return
      if (e.key === ' ') toggle()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, step])

  function edit(next: string) {
    setText(next)
    setPosition(0)
    setPlaying(false)
  }

  function commitDraft() {
    chooseWpm(clampWpm(Number(wpmDraft)))
  }

  const empty = words.length === 0
  const done = !empty && !playing && position >= last
  const progress = empty ? 0 : ((position + 1) / words.length) * 100

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-2 md:h-12 md:px-3">
        <h1 className="px-2 text-base font-medium md:text-sm">Speed reader</h1>
        <span className="text-xs text-muted-foreground tabular-nums">{words.length === 1 ? '1 word' : `${words.length} words`}</span>
      </header>
      <main className="min-h-0 flex-1 overflow-auto rounded-tl-xl bg-background shadow-xs max-md:rounded-none">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
          <section aria-label="Reader" className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-xs">
            <div className="flex h-24 items-center justify-center">
              <Word word={words[position]} />
            </div>
            <Progress value={progress} aria-label="Progress through the text" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex items-center gap-1">
                <Button type="button" disabled={empty} onClick={toggle}>
                  {playing ? <IconPlayerPause stroke={1.5} /> : <IconPlayerPlay stroke={1.5} />}
                  {playing ? 'Pause' : done ? 'Read again' : position > 0 ? 'Resume' : 'Start'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Back to the first word"
                  title="Back to the first word"
                  disabled={empty || (position === 0 && !playing)}
                  onClick={() => {
                    setPlaying(false)
                    setPosition(0)
                  }}
                >
                  <IconRotate stroke={1.5} />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Slower by ${WPM_STEP} words per minute`} disabled={wpm <= MIN_WPM} onClick={() => chooseWpm(clampWpm(wpm - WPM_STEP))}>
                  <IconMinus stroke={1.75} />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label="Words per minute"
                  min={MIN_WPM}
                  max={MAX_WPM}
                  step={WPM_STEP}
                  value={wpmDraft}
                  className="w-20 text-center tabular-nums"
                  onChange={e => {
                    setWpmDraft(e.target.value)
                    const n = Number(e.target.value)
                    if (e.target.value !== '' && n >= MIN_WPM && n <= MAX_WPM) chooseWpm(Math.round(n))
                  }}
                  onBlur={commitDraft}
                  onKeyDown={e => e.key === 'Enter' && commitDraft()}
                />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Faster by ${WPM_STEP} words per minute`} disabled={wpm >= MAX_WPM} onClick={() => chooseWpm(clampWpm(wpm + WPM_STEP))}>
                  <IconPlus stroke={1.75} />
                </Button>
                <span className="text-xs text-muted-foreground">wpm</span>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums sm:ml-auto">
                {empty ? 'Nothing to read yet' : done ? `Done, ${words.length} words` : `${position + 1} of ${words.length} · ${formatDuration(secondsLeft(words, position, wpm))} left`}
              </p>
            </div>
          </section>
          <div className="flex flex-col gap-2">
            <label htmlFor="speed-text" className="px-1 text-xs font-medium text-muted-foreground">
              Text
            </label>
            <Textarea id="speed-text" value={text} onChange={e => edit(e.target.value)} placeholder="Paste or type the text you want to read." className="min-h-40" />
            <p className="px-1 text-xs text-muted-foreground">Space starts and pauses, and the arrow keys step a word. Changing the text starts it over.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
