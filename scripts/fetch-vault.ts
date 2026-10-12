// scripts/fetch-vault.ts
// Shallow-clones the vault repo for a build (spec §7.1). Tokens never reach
// logs or errors. `bun scripts/fetch-vault.ts` clones into .vault/.
import { rmSync } from 'node:fs'
import { join } from 'node:path'

type Env = Record<string, string | undefined>

// Everything between "//" and the last "@" of a URL is userinfo, even when the
// password itself contains "@" or "/". Literal secrets (the token) go first.
const USERINFO = /\/\/[^\s'"]*@/g

export function redact(text: string, secrets: (string | undefined)[] = []): string {
  let out = text
  for (const secret of secrets) if (secret) out = out.split(secret).join('***')
  return out.replace(USERINFO, '//***@')
}

// For the stored remote URL only the authority can hold credentials, so an "@" later in
// the path (https://github.com/org/repo@v1.git) is left alone. redact() is greedier on purpose.
export function withoutCredentials(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, '$1')
}

export function vaultSource(env: Env): { url: string; ref: string; display: string } | null {
  const ref = env.VAULT_REF?.trim() || 'main'
  if (env.VAULT_GIT_URL?.trim()) {
    const url = env.VAULT_GIT_URL.trim()
    return { url, ref, display: redact(url) }
  }
  if (!env.VAULT_REPO?.trim()) return null
  const repo = env.VAULT_REPO.trim()
  const token = env.VAULT_TOKEN?.trim()
  const url = token ? `https://x-access-token:${token}@github.com/${repo}.git` : `https://github.com/${repo}.git`
  return { url, ref, display: redact(url, [token]) }
}

export function fetchVault(env: Env, dest: string): string {
  const source = vaultSource(env)
  if (!source) throw new Error('Set VAULT_PATH (local dev) or VAULT_REPO + VAULT_TOKEN (deploys).')
  const secrets = [env.VAULT_TOKEN?.trim()]
  const git = (args: string[]) =>
    Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  const lastLine = (r: { stderr: Buffer }) => redact(r.stderr.toString(), secrets).trim().split('\n').pop() ?? 'unknown error'
  rmSync(dest, { recursive: true, force: true })
  // "--" keeps a URL that starts with "-" from being read as a git option.
  // An empty credential.helper stops any configured helper (osxkeychain, store…) from saving the token.
  const clone = git(['-c', 'credential.helper=', 'clone', '--quiet', '--depth', '1', '--branch', source.ref, '--', source.url, dest])
  if (!clone.success) throw new Error(`Couldn't clone ${source.display}: ${lastLine(clone)}`)
  // Don't leave the token behind in .vault/.git/config.
  const clean = withoutCredentials(source.url)
  if (clean !== source.url) {
    const reset = git(['-C', dest, 'remote', 'set-url', 'origin', clean])
    if (!reset.success) {
      rmSync(dest, { recursive: true, force: true })
      throw new Error(`Cloned ${source.display} but couldn't remove its credentials from git config: ${lastLine(reset)}`)
    }
  }
  return dest
}

if (import.meta.main) {
  const dest = fetchVault(process.env, join(import.meta.dir, '..', '.vault'))
  console.log(`soii: cloned the vault into ${dest}`)
}
