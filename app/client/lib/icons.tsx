// app/client/lib/icons.tsx
// Icon ids that config may use for workspaces and tabs, mapped to Tabler icons.
// Unknown ids fall back to a file icon.
import {
  IconBook,
  IconBooks,
  IconBriefcase,
  IconCalendar,
  IconChartBar,
  IconCoins,
  IconFile,
  IconFlask,
  IconFolder,
  IconHeadphones,
  IconHeart,
  IconMovie,
  IconNews,
  IconNotebook,
  IconSchool,
  IconSparkles,
  IconSun,
  IconTarget,
  IconUser,
  IconUsers,
  IconVideo,
  IconWorld,
  type TablerIcon
} from '@tabler/icons-react'

const ICONS: Record<string, TablerIcon> = {
  book: IconBook,
  books: IconBooks,
  briefcase: IconBriefcase,
  calendar: IconCalendar,
  chart: IconChartBar,
  coins: IconCoins,
  file: IconFile,
  flask: IconFlask,
  folder: IconFolder,
  headphones: IconHeadphones,
  heart: IconHeart,
  movie: IconMovie,
  news: IconNews,
  notebook: IconNotebook,
  school: IconSchool,
  sparkles: IconSparkles,
  sun: IconSun,
  target: IconTarget,
  user: IconUser,
  users: IconUsers,
  video: IconVideo,
  world: IconWorld
}

export const ICON_IDS = Object.keys(ICONS)

export function iconFor(id: string | undefined): TablerIcon {
  return (id && ICONS[id]) || IconFile
}
