// "Open note": a hyperlink-style button in Obsidian purple that goes to the reader.
import { cn } from '../../ui/utils'

export function OpenNoteLink({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('shrink-0 text-xs text-obsidian underline underline-offset-2 hover:text-obsidian/80', className)}>
      Open note
    </button>
  )
}
