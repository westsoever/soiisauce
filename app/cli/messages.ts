// app/cli/messages.ts
// Wording the CLI prints about versions and releases.
import { compareUrl, releaseUrl } from './vault-files'
import { isNewer } from './version'

/** Links after an update: the release page, and what changed since the version you had. */
export function updateLinks(oldVersion: string | null, newTag: string): string[] {
  const links = [`Release notes: ${releaseUrl(newTag)}`]
  if (oldVersion) links.push(`What changed: ${compareUrl(`v${oldVersion.replace(/^v/, '')}`, newTag)}`)
  return links
}

/** The "version" line of `soii status`. */
export function versionLine(installed: string | null, latest: string | null): string {
  const have = installed ? `v${installed.replace(/^v/, '')}` : 'unknown'
  if (!latest) return `${have}   (latest unknown: could not reach GitHub)`
  return isNewer(installed, latest) ? `${have}   (${latest} is available: run \`soii update\`)` : `${have}   (latest)`
}
