import { describe, expect, test } from 'bun:test'
import { clampWpm, DEFAULT_WPM, formatDuration, MAX_WPM, MIN_WPM, pivotIndex, secondsLeft, splitAtPivot, splitWords, wordDelay } from './speed-read'

describe('splitWords', () => {
  test('splits on any whitespace and keeps punctuation on its word', () => {
    expect(splitWords('One fish,  two fish.\n\nRed\tfish!')).toEqual(['One', 'fish,', 'two', 'fish.', 'Red', 'fish!'])
  })

  test('nothing to read in an empty or blank text', () => {
    expect(splitWords('')).toEqual([])
    expect(splitWords(' \n\t ')).toEqual([])
  })
})

describe('pivot', () => {
  test('sits a little left of the middle, further right in longer words', () => {
    expect(['a', 'to', 'the', 'quick', 'brown', 'running', 'wonderful', 'reading!!!', 'extraordinary', 'internationalisation'].map(pivotIndex)).toEqual([0, 1, 1, 1, 1, 2, 2, 3, 3, 4])
  })

  test('cuts the word around the pivot letter', () => {
    expect(splitAtPivot('reading')).toEqual({ before: 're', pivot: 'a', after: 'ding' })
    expect(splitAtPivot('I')).toEqual({ before: '', pivot: 'I', after: '' })
    expect(splitAtPivot('')).toEqual({ before: '', pivot: '', after: '' })
  })

  test('counts a letter outside the basic plane as one', () => {
    expect(splitAtPivot('a😀bc')).toEqual({ before: 'a', pivot: '😀', after: 'bc' })
  })
})

describe('wordDelay', () => {
  test('is 60000 / wpm for a plain word', () => {
    expect(wordDelay('word', 300)).toBe(200)
    expect(wordDelay('word', 600)).toBe(100)
  })

  test('waits longer after a comma, longer still after the end of a sentence', () => {
    expect(wordDelay('word,', 300)).toBe(300)
    expect(wordDelay('word.', 300)).toBe(400)
    expect(wordDelay('word?!', 300)).toBe(400)
    expect(wordDelay('wait…', 300)).toBe(400)
  })

  test('sees the end of a sentence through a closing quote or bracket', () => {
    expect(wordDelay('said.”', 300)).toBe(400)
    expect(wordDelay('(done.)', 300)).toBe(400)
  })

  test('keeps to the speed limits', () => {
    expect(wordDelay('word', 1)).toBe(60000 / MIN_WPM)
    expect(wordDelay('word', 99999)).toBe(60000 / MAX_WPM)
  })
})

describe('clampWpm', () => {
  test('rounds and clamps, and falls back to the default for nonsense', () => {
    expect(clampWpm(299.6)).toBe(300)
    expect(clampWpm(0)).toBe(MIN_WPM)
    expect(clampWpm(5000)).toBe(MAX_WPM)
    expect(clampWpm(Number.NaN)).toBe(DEFAULT_WPM)
    expect(clampWpm(Number('abc'))).toBe(DEFAULT_WPM)
  })
})

describe('time left', () => {
  test('adds up the delays from a word to the end', () => {
    const words = ['One', 'two', 'three.']
    expect(secondsLeft(words, 0, 300)).toBe(1) // 200 + 200 + 400 ms
    expect(secondsLeft(words, 2, 300)).toBe(0)
    expect(secondsLeft(words, 3, 300)).toBe(0)
    expect(secondsLeft(Array(300).fill('word'), 0, 300)).toBe(60)
  })

  test('formats as m:ss, with hours when there are any', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(75)).toBe('1:15')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(-3)).toBe('0:00')
  })
})
