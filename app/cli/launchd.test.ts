import { expect, test } from 'bun:test'
import { parseLaunchctlPrint } from './launchd'

const running = `gui/501/com.soii.server = {
\tactive count = 1
\tpath = /Users/me/Library/LaunchAgents/com.soii.server.plist
\tstate = running

\tprogram = /Users/me/.bun/bin/bun
\tpid = 79839
\tlast exit code = (never exited)
}`

const waiting = `gui/501/com.soii.server = {
\tstate = not running
\tlast exit code = 1
}`

test('a running agent has its pid and state', () => {
  expect(parseLaunchctlPrint(running)).toEqual({ state: 'running', pid: 79839 })
})

test('an agent that is loaded but not running has no pid', () => {
  expect(parseLaunchctlPrint(waiting)).toEqual({ state: 'not running', pid: null })
})

test('output we cannot read says so', () => {
  expect(parseLaunchctlPrint('')).toEqual({ state: 'unknown', pid: null })
})
