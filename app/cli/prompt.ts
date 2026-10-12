// app/cli/prompt.ts
// Asking questions in a terminal, with plain node:readline. The interface is small so tests can pipe answers in.
import { createInterface } from 'node:readline'

/** Ctrl-C, or the input ended (EOF) before the questions were answered. Nothing has been written when this is thrown. */
export class Aborted extends Error {
  constructor() {
    super('Cancelled.')
    this.name = 'Aborted'
  }
}

export interface Prompter {
  /** Show `question` and wait for one line (trimmed). Throws Aborted on Ctrl-C or end of input. */
  ask(question: string): Promise<string>
  close(): void
}

/**
 * Reads lines from `input`. Lines that arrive before they are asked for are kept, so a pipe of answers works
 * (`printf 'new\n…' | soii setup`); when a pipe is used the answer is echoed so the transcript still reads as a conversation.
 */
export function readlinePrompter(input: NodeJS.ReadableStream & { isTTY?: boolean }, output: NodeJS.WritableStream): Prompter {
  const terminal = Boolean(input.isTTY)
  const rl = createInterface({ input, output, terminal })
  const lines: string[] = []
  const waiting: { resolve: (line: string) => void; reject: (err: Error) => void }[] = []
  let closed = false
  rl.on('line', line => {
    const next = waiting.shift()
    if (next) next.resolve(line)
    else lines.push(line)
  })
  rl.on('close', () => {
    closed = true
    for (const w of waiting.splice(0)) w.reject(new Aborted())
  })
  rl.on('SIGINT', () => {
    output.write('\n')
    rl.close()
  })
  return {
    ask(question) {
      return new Promise<string>((resolve, reject) => {
        const done = (line: string) => {
          if (!terminal) output.write(`${line}\n`)
          resolve(line.trim())
        }
        const buffered = lines.shift()
        if (!terminal) output.write(question)
        else if (!closed) {
          rl.setPrompt(question)
          rl.prompt()
        }
        if (buffered !== undefined) return done(buffered)
        if (closed) {
          if (!terminal) output.write('\n')
          return reject(new Aborted())
        }
        waiting.push({ resolve: done, reject })
      })
    },
    close: () => rl.close()
  }
}

/** Answers from a list, for tests. Runs out → Aborted, like the end of a pipe. `transcript` collects every question asked. */
export function scriptedPrompter(answers: string[], transcript: string[] = []): Prompter {
  const rest = [...answers]
  return {
    async ask(question) {
      transcript.push(question)
      const next = rest.shift()
      if (next === undefined) throw new Aborted()
      return next.trim()
    },
    close() {}
  }
}

/** y / yes / n / no (any case), or Enter for `fallback`. Asks again on anything else. */
export async function askYesNo(p: Prompter, question: string, fallback: boolean): Promise<boolean> {
  for (;;) {
    const a = (await p.ask(`${question} [${fallback ? 'Y/n' : 'y/N'}] `)).toLowerCase()
    if (a === '') return fallback
    if (a === 'y' || a === 'yes') return true
    if (a === 'n' || a === 'no') return false
  }
}
