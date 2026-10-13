// app/cli/vault-files.ts
// The few files soii keeps in a vault's .soii/ folder.
export const REPO = 'westsoever/soii'

/** Where soii's releases live (git remote). SOII_REMOTE overrides it for tests and forks. */
export const remoteFromEnv = (env: Record<string, string | undefined>): string => env.SOII_REMOTE?.trim() || `https://github.com/${REPO}.git`

/** The release page for a tag, and the comparison between two. */
export const releaseUrl = (tag: string): string => `https://github.com/${REPO}/releases/tag/${tag}`
export const compareUrl = (from: string, to: string): string => `https://github.com/${REPO}/compare/${from}...${to}`

/** `1.2.3` and `v1.2.3` both pin the tag v1.2.3; any other ref (a branch, for testing) is pinned as it is. */
export const pinSpec = (ref: string): string => `github:${REPO}#${/^\d+\.\d+\.\d+$/.test(ref) ? `v${ref}` : ref}`

/** The tag or branch the vault's .soii/package.json pins soii to. */
export function parsePin(packageJson: string): string | null {
  try {
    const spec = (JSON.parse(packageJson) as { dependencies?: Record<string, string> }).dependencies?.soii
    return spec?.split('#')[1] || null
  } catch {
    return null
  }
}

export function renderSoiiPackageJson(spec: string): string {
  return `${JSON.stringify({ private: true, dependencies: { soii: spec } }, null, 2)}\n`
}

/** Point the soii dependency at `spec`, leaving everything else in the file alone. */
export function setPin(packageJson: string, spec: string): string {
  let pkg: { dependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(packageJson)
  } catch {
    throw new Error(".soii/package.json isn't valid JSON. Fix it, then run the command again.")
  }
  pkg.dependencies = { ...pkg.dependencies, soii: spec }
  return `${JSON.stringify(pkg, null, 2)}\n`
}

export const SOII_GITIGNORE_LINES = ['soii/', 'build/', 'logs/', 'cache/', '.env.local', 'node_modules/']

/** Add the lines that aren't already there; the file stays as the owner wrote it otherwise. */
export function ensureLines(text: string, lines: string[]): string {
  const have = new Set(text.split('\n').map(l => l.trim()))
  const missing = lines.filter(l => !have.has(l))
  if (missing.length === 0) return text
  const base = text === '' || text.endsWith('\n') ? text : `${text}\n`
  return `${base}${missing.join('\n')}\n`
}
