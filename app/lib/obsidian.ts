// "Open in Obsidian": the obsidian:// link for a note, and the vault name it needs.
// Obsidian names a vault after its folder, so the name is the last segment of
// VAULT_PATH, or of the repo when soii builds from a clone. `obsidianVault` in
// soii.config.yml overrides it when the two differ.

/** obsidian://open for a vault-relative path ("05-Knowledge/People/Anna.md"). */
export function obsidianUrl(vault: string, path: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`
}

const lastSegment = (value: string) =>
  value
    .trim()
    .replace(/[/\\]+$/, '')
    .split(/[/\\:]/)
    .pop()
    ?.replace(/\.git$/, '') || null

/** The Obsidian vault name soii guesses from its build env. null when there's nothing to go on. */
export function vaultNameFrom(env: Record<string, string | undefined>): string | null {
  for (const key of ['VAULT_PATH', 'VAULT_REPO', 'VAULT_GIT_URL']) {
    const value = env[key]?.trim()
    if (value) return lastSegment(value)
  }
  return null
}
