// Reads soii's runtime configuration (spec §8.1, §14) and names what's missing
// — names only, never values.
type EnvSource = Record<string, string | undefined>

export interface SoiiEnv {
  githubClientId: string | null
  githubClientSecret: string | null
  allowedLogins: string[]
  sessionSecret: string | null
  devAuth: boolean
  /** SOII_LOCAL=1: soii installed in a vault and served on localhost. No sign-in; never on Vercel. */
  local: boolean
  /** SOII_LOCAL_FORCE=1: skip the loopback-only guards (bind host and Host header). */
  localForce: boolean
  /** Writing notes and syncing (spec: Library "Add"). All optional; the features switch themselves off. */
  vaultRepo: string | null
  vaultRef: string
  vaultWriteToken: string | null
  vaultPath: string | null
  /** The soii release this server runs (set by `soii run` from the installed package.json). */
  soiiVersion: string | null
  onVercel: boolean
}

const value = (v: string | undefined) => (v?.trim() ? v.trim() : null)

export function readEnv(source: EnvSource = process.env): SoiiEnv {
  return {
    githubClientId: value(source.GITHUB_CLIENT_ID),
    githubClientSecret: value(source.GITHUB_CLIENT_SECRET),
    allowedLogins: (source.SOII_ALLOWED_GITHUB_LOGINS ?? '')
      .split(',')
      .map(s => s.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean),
    sessionSecret: value(source.SOII_SESSION_SECRET),
    devAuth: (source.SOII_DEV_AUTH === '1' || source.SOII_LOCAL === '1') && !source.VERCEL,
    local: source.SOII_LOCAL === '1' && !source.VERCEL,
    localForce: source.SOII_LOCAL_FORCE === '1',
    vaultRepo: value(source.VAULT_REPO),
    vaultRef: value(source.VAULT_REF) ?? 'main',
    vaultWriteToken: value(source.VAULT_WRITE_TOKEN),
    vaultPath: value(source.VAULT_PATH),
    soiiVersion: value(source.SOII_VERSION),
    onVercel: Boolean(source.VERCEL)
  }
}

export function missingEnv(env: SoiiEnv): string[] {
  if (env.devAuth) return []
  const missing: string[] = []
  if (!env.githubClientId) missing.push('GITHUB_CLIENT_ID')
  if (!env.githubClientSecret) missing.push('GITHUB_CLIENT_SECRET')
  if (env.allowedLogins.length === 0) missing.push('SOII_ALLOWED_GITHUB_LOGINS')
  if (!env.sessionSecret || env.sessionSecret.length < 32) missing.push('SOII_SESSION_SECRET')
  return missing
}

// Only used when dev auth is on (never on Vercel), so signed URLs still work locally.
export const DEV_SECRET = 'soii-local-dev-secret-never-used-on-vercel'

export function signingSecret(env: SoiiEnv): string {
  return env.sessionSecret ?? DEV_SECRET
}
