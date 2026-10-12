// app/cli/watch.ts
// Which vault changes should rebuild soii. Same rule the compiler uses to skip files (app/vault/walk.ts):
// dot-entries and node_modules. That also keeps `.soii/build` (soii's own output, inside the vault) from retriggering itself.
export function isIgnoredVaultPath(rel: string | null): boolean {
  if (!rel) return true
  return rel.split(/[\\/]/).some(part => part.startsWith('.') || part === 'node_modules')
}
