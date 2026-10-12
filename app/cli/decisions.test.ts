import { expect, test } from 'bun:test'
import { newDecisions } from './decisions'

const before = `# Decisions

**D75 · 2026-10-12 · agent.** The owner's weekly check is a cloud routine.

**D76 · 2026-10-12 · owner + planner.** soii moves into the vault.
  - more detail on D76
`
const after = `${before}
**D77 · 2026-10-12 · soiiAgent02.** The template vault.
  - **\`examples/demo-vault/\` is now \`template/\`**

**D78 · 2026-10-13 · soiiAgent01.** The runtime.
`

test('lists the decisions that are in the new file and not in the old, first line only', () => {
  expect(newDecisions(before, after)).toEqual(['D77 · 2026-10-12 · soiiAgent02. The template vault.', 'D78 · 2026-10-13 · soiiAgent01. The runtime.'])
})

test('nothing new means an empty list', () => {
  expect(newDecisions(after, after)).toEqual([])
})

test('an unreadable old file means everything counts as new, capped', () => {
  expect(newDecisions('', after)).toHaveLength(4)
  expect(newDecisions('', after, 2)).toEqual(["D75 · 2026-10-12 · agent. The owner's weekly check is a cloud routine.", 'D76 · 2026-10-12 · owner + planner. soii moves into the vault.'])
})

test('very long lines are shortened', () => {
  const long = `**D99 · 2026-10-13 · x.** ${'word '.repeat(100)}`
  const [line] = newDecisions('', long)
  expect(line.length).toBeLessThanOrEqual(200)
  expect(line.endsWith('…')).toBe(true)
})
