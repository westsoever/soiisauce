// app/client/log/LogScreen.tsx
// /log → pick a kind; /log/<kind> → the form.
import { kindById } from '../../lib/log'
import type { VaultIndex } from '../../lib/types'
import { NothingHere } from '../components/EmptyTab'
import { KindPicker } from './KindPicker'
import { LogForm } from './LogForm'

export function LogScreen({ index, kindId }: { index: VaultIndex; kindId?: string }) {
  if (!kindId) return <KindPicker />
  const kind = kindById(kindId)
  if (!kind) return <NothingHere message={`There's nothing called “${kindId}” to log.`} />
  return <LogForm key={kind.id} kind={kind} index={index} />
}
