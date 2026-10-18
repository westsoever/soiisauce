// `soii update` runs the newly fetched checkout's CLI, which can't start until its packages are installed (v0.1.6 → v0.1.7 crashed on this).
import { expect, test } from 'bun:test'
import { installDeps } from './commands'
import { realCtx } from './context'

function ctxWith(codes: number[]) {
  const calls: { cmd: string; args: string[]; cwd?: string }[] = []
  const errs: string[] = []
  const ctx = {
    ...realCtx(),
    err: (m: string) => void errs.push(m),
    stream: async (cmd: string, args: string[], opts?: { cwd?: string }) => {
      calls.push({ cmd, args, cwd: opts?.cwd })
      return codes[calls.length - 1] ?? 1
    },
  }
  return { ctx, calls, errs }
}

test('installs from the lockfile in the checkout', async () => {
  const { ctx, calls, errs } = ctxWith([0])
  expect(await installDeps(ctx, '/v/.soii/soii')).toBe(true)
  expect(calls).toEqual([{ cmd: 'bun', args: ['install', '--frozen-lockfile', '--no-summary'], cwd: '/v/.soii/soii' }])
  expect(errs).toEqual([])
})

test('falls back to a plain install when the lockfile does not match', async () => {
  const { ctx, calls } = ctxWith([1, 0])
  expect(await installDeps(ctx, '/r')).toBe(true)
  expect(calls.map(c => c.args)).toEqual([['install', '--frozen-lockfile', '--no-summary'], ['install', '--no-summary']])
})

test('says where bun install failed when both attempts fail', async () => {
  const { ctx, errs } = ctxWith([1, 1])
  expect(await installDeps(ctx, '/r')).toBe(false)
  expect(errs).toEqual(['soii: `bun install` failed in /r.'])
})
