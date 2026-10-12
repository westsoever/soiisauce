// app/client/log/kind-icons.ts
import {
  IconBook,
  IconBrandYoutube,
  IconFlask,
  IconHeadphones,
  IconMessageCircle,
  IconMovie,
  IconNews,
  IconNote,
  IconReceipt,
  IconTarget,
  IconUserPlus,
  IconVideo,
  type TablerIcon
} from '@tabler/icons-react'

const ICONS: Record<string, TablerIcon> = {
  conversation: IconMessageCircle,
  person: IconUserPlus,
  book: IconBook,
  movie: IconMovie,
  goal: IconTarget,
  expense: IconReceipt,
  note: IconNote,
  audiobook: IconHeadphones,
  documentary: IconVideo,
  video: IconBrandYoutube,
  article: IconNews,
  research: IconFlask
}

export const kindIcon = (id: string): TablerIcon => ICONS[id] ?? IconNote
