// app/client/reader/OpenInObsidian.tsx
// "Open in Obsidian" for a note. Editing happens in Obsidian; soii picks the save up on its next
// build (useFreshVault). It lives in one place, the reader's top bar (/n/<id>, D64); views that
// list or embed notes, such as the Today feeds, link to the reader instead. It renders nothing
// only when there's no link to build: the vault index hasn't loaded, or soii can't tell which
// vault the notes belong to.
import { obsidianUrl } from '../../lib/obsidian'
import { useVault } from '../lib/queries'
import { buttonVariants } from '../ui/button'
import { cn } from '../ui/utils'

export function OpenInObsidian({ path, className }: { path: string | undefined; className?: string }) {
  const vaultName = useVault().data?.config.obsidianVault
  if (!vaultName || !path) return null
  return (
    <a href={obsidianUrl(vaultName, path)} className={cn(buttonVariants({ size: 'sm' }), 'bg-obsidian text-white hover:bg-obsidian/90', className)}>
      Open in Obsidian
    </a>
  )
}
