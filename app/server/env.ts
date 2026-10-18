// Reads soii's runtime configuration (spec §8.1, §14). soii runs on this machine only, with no sign-in.
type EnvSource = Record<string, string | undefined>

export interface SoiiEnv {
  /** SOII_LOCAL=1: soii installed in a vault and served on localhost by `soii run`. */
  local: boolean
  /** SOII_LOCAL_FORCE=1: skip the loopback-only guards (bind host and Host header). */
  localForce: boolean
  /** The vault folder on disk. Writing notes and syncing need it; without it they switch themselves off. */
  vaultPath: string | null
  /** The soii release this server runs (set by `soii run` from the installed package.json). */
  soiiVersion: string | null
  /** SOII_OFFLINE=1: soii contacts nothing outside this machine (no rates, covers or update check; docs/privacy.md). */
  offline: boolean
}

const value = (v: string | undefined) => (v?.trim() ? v.trim() : null)

export function readEnv(source: EnvSource = process.env): SoiiEnv {
  return {
    local: source.SOII_LOCAL === '1',
    localForce: source.SOII_LOCAL_FORCE === '1',
    vaultPath: value(source.VAULT_PATH),
    soiiVersion: value(source.SOII_VERSION),
    offline: source.SOII_OFFLINE === '1'
  }
}

/**
 * The key for the cover-lookup URLs soii hands out (covers/sign.ts). It is a constant in the source, so it keeps nobody
 * from forging a cover URL: that was the point when soii was hosted for the public, and it is not any more. What guards
 * this server now is the Host check and loopback-only binding. A random key per run would break the covers of any page
 * left open across a restart (every vault change restarts the server), so it stays as it is.
 */
export const SIGNING_SECRET = 'soii-local-signing-secret'
