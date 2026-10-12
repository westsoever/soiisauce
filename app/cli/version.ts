// app/cli/version.ts
// Release tags are `vX.Y.Z`. Anything else (pre-releases, branch-like tags) is not a release.
export type Semver = [number, number, number]

export function parseTag(tag: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim())
  return m && tag.trim().startsWith('v') ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function parseVersion(v: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) throw new Error(`Not a version: ${!x ? a : b}`)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** The highest release tag in `git ls-remote --tags <url>` output. */
export function newestTag(lsRemote: string): string | null {
  let best: string | null = null
  for (const line of lsRemote.split('\n')) {
    const ref = line.split('\t')[1]?.trim()
    if (!ref?.startsWith('refs/tags/') || ref.endsWith('^{}')) continue
    const tag = ref.slice('refs/tags/'.length)
    if (!parseTag(tag)) continue
    if (best === null || compareVersions(tag, best) > 0) best = tag
  }
  return best
}

/** Is `latest` (a tag) newer than `installed` (a package version, or null if unknown)? */
export function isNewer(installed: string | null, latest: string | null): boolean {
  if (!latest) return false
  if (!installed || !parseVersion(installed)) return true
  return compareVersions(latest, installed) > 0
}
