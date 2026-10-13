// app/cli/changelog.ts
// `soii update` shows what's new: the CHANGELOG.md sections the old install didn't have. CHANGELOG.md is public, one
// `## vX.Y.Z` section per release, newest first; /soii-release writes each section with the maintainer. Never throws:
// a missing file is read as '' by the caller, and anything that isn't a release heading is skipped.
export interface ChangelogSection {
  version: string
  body: string
}

const RELEASE = /^## (v\d+\.\d+\.\d+)\b/
const OTHER_HEADING = /^#{1,2} /

export function parseChangelog(md: string): ChangelogSection[] {
  const out: ChangelogSection[] = []
  let version: string | null = null
  let lines: string[] = []
  const close = () => {
    if (version) out.push({ version, body: lines.join('\n').trim() })
    version = null
    lines = []
  }
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const release = RELEASE.exec(line)
    if (release) {
      close()
      version = release[1]
    } else if (OTHER_HEADING.test(line)) close()
    else if (version) lines.push(line)
  }
  close()
  return out
}

export function changelogSection(md: string, version: string): ChangelogSection | null {
  const tag = version.startsWith('v') ? version : `v${version}`
  return parseChangelog(md).find(s => s.version === tag) ?? null
}

export function newChangelog(before: string, after: string, max = 5): string[] {
  const known = new Set(parseChangelog(before).map(s => s.version))
  return parseChangelog(after)
    .filter(s => !known.has(s.version))
    .slice(0, max)
    .map(s => (s.body ? `## ${s.version}\n\n${s.body}` : `## ${s.version}`))
}
