// app/server/local.ts
// soii has no sign-in, in local mode (SOII_LOCAL=1) and in dev mode (`bun run dev`) alike, so its only protection
// is that nothing but this machine can reach it. SOII_LOCAL_FORCE=1 switches the guards off, in either mode.
import type { SoiiEnv } from './env'

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
}

/** Why the server must not bind `host`, or null if it may. */
export function bindProblem(env: SoiiEnv, host: string): string | null {
  if (env.localForce || isLoopbackHost(host)) return null
  return `soii: it serves localhost only, and HOST=${host} would put your vault on the network without a sign-in. Use HOST=127.0.0.1, or set SOII_LOCAL_FORCE=1 if you really mean it.`
}

/**
 * The Host header of a request to a local-mode server. A web page can point a hostname it controls at
 * 127.0.0.1 ("DNS rebinding") and read the vault from the browser; the browser still sends that hostname.
 */
export function hostHeaderAllowed(header: string | undefined): boolean {
  if (!header) return false
  const m = /^(\[[0-9a-f:]+\]|[^:]+)(:\d{1,5})?$/i.exec(header.trim())
  return Boolean(m) && isLoopbackHost(m![1])
}
