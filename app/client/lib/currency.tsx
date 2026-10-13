// app/client/lib/currency.tsx
// The Finance display currency (D114): one choice for the whole page, remembered per browser. Tiles, charts
// and currency columns convert to it; "As entered" shows every amount the way the note wrote it.
import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  currenciesUsed,
  currencyOptions,
  FALLBACK_RATES,
  pickDisplay,
  withOverrides,
  type Conversion,
  type Rates
} from '../../lib/currency'
import { formatDate } from '../../lib/format'
import { StatsOptionsSchema } from '../../lib/stats'
import type { TabConfig, VaultIndex } from '../../lib/types'
import { Button } from '../ui/button'
import { cn } from '../ui/utils'
import { api } from './http'
import { readJson, storageKeys, writeJson } from './storage'

export const ORIGINAL = 'original'

export interface CurrencyState {
  /** The currency amounts are shown in; null means "as entered". */
  display: string | null
  /** What views convert with; null when showing amounts as entered. */
  conversion: Conversion | null
  rates: Rates
  options: string[]
  choose: (code: string) => void
}

export const CurrencyContext = createContext<CurrencyState>({
  display: null,
  conversion: null,
  rates: FALLBACK_RATES,
  options: [],
  choose: () => {}
})

export const useCurrency = () => useContext(CurrencyContext)

// Live rates come from the server (which caches them for hours). Until they arrive, or if they never do, the built-in table is used.
function useRates(): Rates {
  const query = useQuery({ queryKey: ['rates'], queryFn: () => api<Rates>('/api/rates'), staleTime: 6 * 60 * 60_000, retry: false })
  return query.data ?? FALLBACK_RATES
}

export function CurrencyProvider({ index, children }: { index: VaultIndex; children: ReactNode }) {
  const [stored, setStored] = useState<string | null>(() => readJson<string | null>(storageKeys.currency, null))
  const live = useRates()
  const overrides = index.config.currency?.rates
  const rates = useMemo(() => withOverrides(live, overrides), [live, overrides])
  const used = useMemo(() => currenciesUsed(index.notes), [index.notes])
  const options = useMemo(() => currencyOptions(used, rates.rates), [used, rates.rates])
  const configured = index.config.currency?.display
  const display = useMemo(() => pickDisplay({ stored, configured, used }), [stored, configured, used])
  const conversion = useMemo<Conversion | null>(() => (display ? { to: display, rates: rates.rates } : null), [display, rates.rates])
  const choose = useCallback((code: string) => {
    setStored(code)
    writeJson(storageKeys.currency, code)
  }, [])
  const value = useMemo(() => ({ display, conversion, rates, options, choose }), [display, conversion, rates, options, choose])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

const MONEY_FIELDS = new Set(['price', 'balance', 'amount'])

/** Does this tab show amounts of money, so the currency switch belongs above it? */
export function tabHasMoney(tab: TabConfig): boolean {
  const options = (tab.options ?? {}) as { columns?: unknown }
  if (tab.view === 'table') {
    return Array.isArray(options.columns) && options.columns.some(c => typeof c === 'object' && c !== null && (c as { format?: unknown }).format === 'currency')
  }
  if (tab.view === 'stats') {
    const parsed = StatsOptionsSchema.safeParse(tab.options ?? {})
    if (!parsed.success) return false
    const specs = [...parsed.data.tiles, ...(parsed.data.chart ? [parsed.data.chart] : [])]
    return specs.some(s => s.agg !== 'count' && (('format' in s && s.format === 'currency') || (s.field !== undefined && MONEY_FIELDS.has(s.field))))
  }
  return false
}

export function rateCaption(state: CurrencyState): string {
  const { display, rates } = state
  const parts: string[] = []
  const rate = display && display !== 'EUR' ? rates.rates[display] : undefined
  if (rate) parts.push(`1 EUR = ${rate.toLocaleString('en-GB', { maximumFractionDigits: 4 })} ${display}`)
  parts.push(rates.source === 'live' ? `ECB rates${rates.date ? `, ${formatDate(rates.date, 'short')}` : ''}` : 'approximate rates')
  return parts.join(' · ')
}

export function CurrencySwitch({ className }: { className?: string }) {
  const state = useCurrency()
  const current = state.display ?? ORIGINAL
  const choices = [...state.options, ORIGINAL]
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <div role="group" aria-label="Show amounts in" className="flex items-center gap-0.5 rounded-lg bg-accent p-0.5">
        {choices.map(code => (
          <Button
            key={code}
            type="button"
            size="xs"
            variant={code === current ? 'outline' : 'ghost'}
            aria-pressed={code === current}
            onClick={() => state.choose(code)}
          >
            {code === ORIGINAL ? 'As entered' : code}
          </Button>
        ))}
      </div>
      {state.display && <span className="text-xs text-muted-foreground tabular-nums">{rateCaption(state)}</span>}
    </div>
  )
}
