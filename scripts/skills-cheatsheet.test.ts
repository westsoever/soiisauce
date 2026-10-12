// Every skill that ships in .claude/skills/ must be listed in docs/skills.md, and the
// cheatsheet must not list skills that no longer exist. Keeps the cheatsheet honest.
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const skillsDir = join(root, '.claude', 'skills')
const shipped = readdirSync(skillsDir).filter(name => existsSync(join(skillsDir, name, 'SKILL.md')))
const cheatsheet = readFileSync(join(root, 'docs', 'skills.md'), 'utf8')
const listed = [...cheatsheet.matchAll(/^\| `\/([a-z0-9-]+)` \|/gm)].map(m => m[1])

const scripts = [...cheatsheet.matchAll(/`bun scripts\/([a-z0-9-]+\.ts)/g)].map(m => m[1])

describe('docs/skills.md', () => {
  test('lists every shipped skill', () => {
    expect(shipped.filter(name => !listed.includes(name))).toEqual([])
  })
  test('lists only skills that exist', () => {
    expect(listed.filter(name => !shipped.includes(name))).toEqual([])
  })
  test('lists the vault scripts, and only scripts that exist', () => {
    for (const name of ['check-vault.ts', 'vault-normalise.ts', 'vault-import.ts', 'find-base64-notes.ts', 'fill-book-meta.ts']) expect(scripts).toContain(name)
    expect(scripts.filter(name => !existsSync(join(root, 'scripts', name)))).toEqual([])
  })
  test('no stale skill names or the old install path in the skills or the cheatsheet', () => {
    const stale = /vault-(health|setup|sync-fix)|node_modules\/soii/
    const files = [join(root, 'docs', 'skills.md'), ...shipped.map(name => join(skillsDir, name, 'SKILL.md'))]
    expect(files.filter(f => stale.test(readFileSync(f, 'utf8'))).map(f => f.replace(root, ''))).toEqual([])
  })
  test('every recursive grep in a skill skips soii\'s own folders (macOS grep descends into .soii/)', () => {
    const bad = shipped.flatMap(name =>
      readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8')
        .split('\n')
        .filter(line => /grep -[a-zA-Z]*r/.test(line) && !/--exclude-dir=\.soii/.test(line))
        .map(line => `${name}: ${line.trim().slice(0, 80)}`)
    )
    expect(bad).toEqual([])
  })
  test('soii-learn and soii-chat never depend on soii-explore: at most one optional mention each', () => {
    for (const name of ['soii-learn', 'soii-chat']) {
      const body = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8').split('\n---\n').slice(1).join('\n---\n')
      expect(body.split('/soii-explore').length - 1).toBeLessThanOrEqual(1)
    }
    const learn = readFileSync(join(skillsDir, 'soii-learn', 'SKILL.md'), 'utf8')
    expect(learn).toContain('Pick for me')
    expect(learn).toMatch(/\(learn\)/)
    expect(learn).not.toMatch(/nothing to drill/)
  })
  test('the release flow is wired together: doc, script, skill, cheatsheet row, link from updating.md', () => {
    const doc = readFileSync(join(root, 'docs', 'releasing.md'), 'utf8')
    const skill = readFileSync(join(skillsDir, 'soii-release', 'SKILL.md'), 'utf8')
    for (const text of [doc, skill]) {
      expect(text).toContain('scripts/release-notes.ts')
      expect(text).toContain('gh release create')
      expect(text).toContain('git tag -a')
    }
    expect(existsSync(join(root, 'scripts', 'release-notes.ts'))).toBe(true)
    expect(skill).toContain('docs/releasing.md')
    expect(readFileSync(join(root, 'docs', 'updating.md'), 'utf8')).toContain('releasing.md')
    expect(cheatsheet).toMatch(/\| `\/soii-release` \| \*\*Maintainers only, not in your vault\.\*\*/)
  })
  test('soii-health fills only new and changed notes, with the script option that does it', () => {
    const health = readFileSync(join(skillsDir, 'soii-health', 'SKILL.md'), 'utf8')
    expect(health).toContain('--files-from')
    expect(health).toContain('Filled properties')
    expect(health).toContain('git -C "$VAULT" fetch --unshallow')
    expect(health).toContain('--diff-filter=AM')
    expect(health).toMatch(/7 days/)
  })
  test('each skill names itself in its frontmatter', () => {
    for (const name of shipped) {
      expect(readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8')).toMatch(new RegExp(`^---\\nname: ${name}\\n`))
    }
  })
})
