// app/client/speed/speed-read.ts
// The pure part of the speed reader: split a pasted text into words, find the letter the eye rests on, and say how long
// a word stays on screen at a given speed.
export const MIN_WPM = 50
export const MAX_WPM = 1500
export const DEFAULT_WPM = 300

export function clampWpm(wpm: number): number {
  if (!Number.isFinite(wpm)) return DEFAULT_WPM
  return Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(wpm)))
}

/** The words of a text, in order. Whitespace (including line breaks) only separates; punctuation stays on its word. */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** Index of the letter to hold still and highlight: a little left of the middle, where reading speed-readers fixate. */
export function pivotIndex(word: string): number {
  const length = [...word].length
  if (length <= 1) return 0
  if (length <= 5) return 1
  if (length <= 9) return 2
  if (length <= 13) return 3
  return 4
}

/** A word cut around its pivot letter. Counts code points, so an emoji or an accented letter is one letter. */
export function splitAtPivot(word: string): { before: string; pivot: string; after: string } {
  const letters = [...word]
  const at = pivotIndex(word)
  return { before: letters.slice(0, at).join(''), pivot: letters[at] ?? '', after: letters.slice(at + 1).join('') }
}

/** How long a word stays up, in ms: 60000 / wpm, longer after a comma and longer still after the end of a sentence. */
export function wordDelay(word: string, wpm: number): number {
  const base = 60000 / clampWpm(wpm)
  const end = word.replace(/["'”’)\]]+$/, '')
  if (/[.!?…]$/.test(end)) return base * 2
  if (/[,;:–—]$/.test(end)) return base * 1.5
  return base
}

/** Time left from word `from` to the end, in whole seconds. */
export function secondsLeft(words: string[], from: number, wpm: number): number {
  let ms = 0
  for (let i = Math.max(0, from); i < words.length; i++) ms += wordDelay(words[i], wpm)
  return Math.round(ms / 1000)
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
