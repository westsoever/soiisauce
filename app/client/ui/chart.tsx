import { createContext, useContext, type ComponentProps, type CSSProperties, type ReactElement } from 'react'
import { ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from './utils'

// Series key → label + colour. Each colour is exposed as --color-<key> so marks can use fill="var(--color-<key>)".
export type ChartConfig = Record<string, { label: string; color: string }>

const ChartConfigContext = createContext<ChartConfig>({})

type ChartContainerProps = Omit<ComponentProps<'div'>, 'children'> & { config: ChartConfig; children: ReactElement }

export function ChartContainer({ config, className, children, ...props }: ChartContainerProps) {
  const colours = Object.fromEntries(
    Object.entries(config).map(([key, series]) => [`--color-${key}`, series.color])
  ) as CSSProperties
  return (
    <ChartConfigContext.Provider value={config}>
      <div
        data-slot="chart"
        style={colours}
        className={cn(
          'text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-surface]:outline-none',
          className
        )}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartConfigContext.Provider>
  )
}

export const ChartTooltip = Tooltip

type TooltipEntry = { dataKey?: string | number; name?: string | number; value?: number | string; color?: string }
type ChartTooltipContentProps = {
  active?: boolean
  payload?: readonly TooltipEntry[]
  label?: string | number
  hideIndicator?: boolean
}

// recharts clones this element and injects active/payload/label.
export function ChartTooltipContent({ active, payload, label, hideIndicator = false }: ChartTooltipContentProps) {
  const config = useContext(ChartConfigContext)
  if (!active || !payload?.length) return null
  return (
    <div className="grid min-w-32 gap-1 rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      {label !== undefined && <div className="font-medium">{label}</div>}
      {payload.map(entry => {
        const key = String(entry.dataKey ?? entry.name ?? '')
        return (
          <div key={key} className="flex items-center gap-2">
            {!hideIndicator && (
              <span
                className="size-2 shrink-0 rounded-[2px] bg-(--swatch)"
                style={{ '--swatch': entry.color ?? `var(--color-${key})` } as CSSProperties}
              />
            )}
            <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
            <span className="ml-auto font-medium tabular-nums">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}
