// "Open in Obsidian": the obsidian:// link for a note, and the vault name it needs.
// Obsidian names a vault after its folder, so the name is the last segment of
// VAULT_PATH. `obsidianVault` in soii.config.yml overrides it when the two differ.

/** obsidian://open for a vault-relative path ("05-Knowledge/People/Anna.md"). */
export function obsidianUrl(vault: string, path: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`
}

const lastSegment = (value: string) =>
  value
    .trim()
    .replace(/[/\\]+$/, '')
    .split(/[/\\]/)
    .pop() || null

/** The Obsidian vault name soii guesses from its build env: the VAULT_PATH folder's name. null when it isn't set. */
export function vaultNameFrom(env: Record<string, string | undefined>): string | null {
  const value = env.VAULT_PATH?.trim()
  return value ? lastSegment(value) : null
}
