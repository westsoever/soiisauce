// app/client/update/UpdateNotice.tsx
// "Update available", shown only when the server has found a newer soii release (local mode). A menu rather than a bare
// tooltip, so hover, keyboard focus and a tap on a phone all reach the same thing: what is available, a copy button for
// /soii-update, and the release page on GitHub.
import { IconCircleArrowUp, IconCopy, IconExternalLink } from '@tabler/icons-react'
import type { VersionInfo } from '../../lib/types'
import { useVersion } from '../lib/queries'
import { toast } from '../lib/toast'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { UPDATE_COMMAND, updateMessage } from './messages'

export async function copyUpdateCommand(): Promise<void> {
  try {
    await navigator.clipboard.writeText(UPDATE_COMMAND)
    toast(`Copied ${UPDATE_COMMAND}. Paste it in Claude Code, inside your vault.`, 'success')
  } catch {
    toast("Couldn't copy.", 'error')
  }
}

/** The newer release, or null when up to date, unknown, or not applicable. */
export function useAvailableUpdate(): VersionInfo | null {
  const info = useVersion().data
  return info?.updateAvailable && info.latest ? info : null
}

/** The two things you can do about it, as menu items. */
export function UpdateActions({ info }: { info: VersionInfo }) {
  return (
    <>
      <DropdownMenuItem className="min-h-11 md:min-h-8" onClick={() => void copyUpdateCommand()}>
        <IconCopy stroke={1.75} />
        Copy {UPDATE_COMMAND}
      </DropdownMenuItem>
      {info.releaseUrl && (
        <DropdownMenuItem className="min-h-11 md:min-h-8" render={<a href={info.releaseUrl} target="_blank" rel="noreferrer" />}>
          <IconExternalLink stroke={1.75} />
          What&apos;s new on GitHub
        </DropdownMenuItem>
      )}
    </>
  )
}

/** The sidebar row, directly below Sync. */
export function UpdateNoticeRow() {
  const info = useAvailableUpdate()
  if (!info) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={150}
        render={
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-foreground transition-colors hover:bg-accent data-popup-open:bg-accent"
          />
        }
      >
        <IconCircleArrowUp size={16} stroke={1.75} className="mx-0.5" />
        Update available
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-sm whitespace-normal text-popover-foreground">{updateMessage(info)}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <UpdateActions info={info} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
