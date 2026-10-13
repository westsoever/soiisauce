// KPI tiles plus one optional bar chart (spec §12). All maths lives in
// app/lib/stats.ts; a single series needs no legend (the heading names it).
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { computeChart, computeTile, StatsOptionsSchema, tileFootnote, type ChartPoint, type TileResult } from '../../lib/stats'
import type { ViewProps } from '../../lib/types'
import { useCurrency } from '../lib/currency'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart'
import { OptionsError } from './cells'

export function StatsView({ tab, notes, index }: ViewProps) {
  const parsed = useMemo(() => StatsOptionsSchema.safeParse(tab.options ?? {}), [tab.options])
  const { conversion } = useCurrency()
  const tiles = useMemo(
    () => (parsed.success ? parsed.data.tiles.flatMap(spec => computeTile(spec, notes, index, conversion ?? undefined)) : []),
    [parsed, notes, index, conversion]
  )
  const chart = useMemo(
    () =>
      parsed.success && parsed.data.chart
        ? { label: parsed.data.chart.label, points: computeChart(parsed.data.chart, notes, index, conversion ?? undefined) }
        : null,
    [parsed, notes, index, conversion]
  )

  if (!parsed.success) return <OptionsError view="stats" error={parsed.error} />
  // WorkspaceScreen shows the empty-tab state for zero notes (checked in Task 0).
  if (notes.length === 0) return null
  if (!tiles.length && !chart) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        This tab has no tiles yet. Add <code className="font-mono">options.tiles</code> in soii.config.yml; docs/workspaces.md has examples.
      </p>
    )
  }

  // A chart whose groups are all empty draws nothing, so with no tiles either there is nothing to show.
  if (!tiles.length && !(chart && chart.points.length > 0)) return <p className="p-4 text-sm text-muted-foreground">Nothing to show yet.</p>

  return (
    <div className="flex flex-col gap-6 p-4 max-md:px-3">
      {tiles.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {tiles.map((tile, i) => (
            <StatTile key={`${i}-${tile.label}`} tile={tile} />
          ))}
        </div>
      )}
      {chart && chart.points.length > 0 && <StatsChart label={chart.label} points={chart.points} />}
    </div>
  )
}

// Labels and values wrap instead of truncating: "DKK 14,50…" hides the currency and a tooltip doesn't
// help on a phone. Grid items stretch, so tiles in one row keep the same height.
function StatTile({ tile }: { tile: TileResult }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-card p-4 shadow-xs">
      <span className="text-xs break-words text-muted-foreground">{tile.label}</span>
      <span className="text-2xl font-medium break-words tabular-nums">{tile.display}</span>
      <span className="text-xs break-words text-muted-foreground tabular-nums">{tileFootnote(tile)}</span>
    </div>
  )
}

function StatsChart({ label, points }: { label: string; points: ChartPoint[] }) {
  const config = { value: { label, color: 'var(--chart-1)' } } satisfies ChartConfig
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <ChartContainer config={config} className="h-60 w-full">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} className="stroke-border/60" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 12 }}
            tickFormatter={(value: string) => (value.length > 10 ? `${value.slice(0, 9)}…` : value)}
          />
          <YAxis tickLine={false} axisLine={false} width={40} tick={{ fontSize: 12 }} allowDecimals={false} />
          <ChartTooltip cursor={{ className: 'fill-muted' }} content={<ChartTooltipContent />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ChartContainer>
    </section>
  )
}
