
"use client"

import * as React from "react"
import {
  Label,
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  Sector,
  Tooltip as RechartsTooltip,
} from "recharts"
import {
  Cell,
  PieProps as RechartsPieProps,
  PieSectorDataItem,
  TooltipProps as RechartsTooltipProps,
} from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  ChartTooltipFrame,
  ChartTooltipItem,
} from "@/components/ui/chart-core"
import { cn } from "@/lib/utils"

const Chart = ChartContainer

const ChartLegendContext = React.createContext<
  | (Pick<ChartConfig, "label" | "color" | "icon"> & {
      payload: any
      value?: string | number
    })[]
  | null
>(null)

function useChartLegend() {
  const context = React.createContext(ChartLegendContext)

  if (!context) {
    throw new Error("useChartLegend must be used within a <Chart />")
  }

  return context
}

const ChartLegend = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    "data-testid"?: string
  }
>(({ className, ...props }, ref) => {
  const legend = useChartLegend()

  if (!legend) {
    return null
  }

  return (
    <div
      ref={ref}
      data-testid="chart-legend"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      {legend.map(({ label, color, icon: Icon, value }, index) => (
        <div
          key={label as string}
          data-testid={`chart-legend-item-${index}`}
          className="flex items-center gap-1.5"
        >
          {Icon ? (
            <Icon
              className="h-3.5 w-3.5"
              style={
                {
                  "--color-foreground": "hsl(var(--muted-foreground))",
                  "--color-primary": color,
                } as React.CSSProperties
              }
            />
          ) : (
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{
                backgroundColor: color,
              }}
            />
          )}
          {label}
          {value && <div className="font-medium">{value}</div>}
        </div>
      ))}
    </div>
  )
})
ChartLegend.displayName = "ChartLegend"

// TODO: Resolve TooltipPortal's missing ref
const ChartTooltipPortal = RechartsTooltip

type PieChartProps = React.ComponentProps<typeof RechartsPieChart> & {
  "data-testid"?: string
}

const PieChart = React.forwardRef<
  HTMLDivElement,
  PieChartProps & {
    config: ChartConfig
    children: React.ReactNode
  }
>(({ children, className, config, "data-testid": testId, ...props }, ref) => {
  const legend = React.useMemo(() => {
    if (!config) {
      return null
    }

    return Object.entries(config).map(([key, config]) => ({
      ...config,
      payload: {
        dataKey: key,
      },
    }))
  }, [config])

  return (
    <ChartLegendContext.Provider value={legend}>
      <Chart
        ref={ref}
        config={config}
        data-testid={testId}
        className={cn("flex flex-col", className)}
      >
        <RechartsPieChart {...props}>{children}</RechartsPieChart>
      </Chart>
    </ChartLegendContext.Provider>
  )
})
PieChart.displayName = "PieChart"

const Pie = React.forwardRef<
  React.ElementRef<typeof RechartsPieChart>,
  Omit<RechartsPieProps, "activeShape" | "inactiveShape"> & {
    activeShape?: React.ComponentType<PieSectorDataItem>
    inactiveShape?: React.ComponentType<PieSectorDataItem>
    "data-testid"?: string
  }
>(({ className, "data-testid": testId, ...props }, ref) => {
  const { config } = useChart()
  const [activeIndex, setActiveIndex] = React.useState<number | null>(0)

  const onMouseOver = React.useCallback(
    (data: any, index: number) => {
      setActiveIndex(index)
    },
    [setActiveIndex]
  )
  const onMouseLeave = React.useCallback(() => {
    setActiveIndex(null)
  }, [setActiveIndex])

  const renderActiveShape = React.useCallback(
    (props: PieSectorDataItem) => {
      const { activeShape: ActiveShape } = props as any

      if (!ActiveShape) {
        return null
      }

      return <ActiveShape {...props} />
    },
    [props.activeShape]
  )

  const renderInactiveShape = React.useCallback(
    (props: PieSectorDataItem) => {
      const { inactiveShape: InactiveShape } = props as any

      if (!InactiveShape) {
        return null
      }

      return <InactiveShape {...props} />
    },
    [props.inactiveShape]
  )

  return (
    <RechartsPie
      {...props}
      // @ts-ignore
      ref={ref}
      className={cn(
        "fill-chart-1 stroke-border",
        "[&_.recharts-pie-sector:focus-visible]:outline-none [&_.recharts-pie-sector:focus-visible]:ring-2 [&_.recharts-pie-sector:focus-visible]:ring-ring [&_.recharts-pie-sector:focus-visible]:ring-offset-2",
        className
      )}
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      activeIndex={activeIndex ?? undefined}
      activeShape={props.activeShape ? renderActiveShape : undefined}
      inactiveShape={props.inactiveShape ? renderInactiveShape : undefined}
    >
      {props.data?.map((entry, index) => (
        <Cell
          key={`cell-${index}`}
          fill={
            config?.[(entry as any).name]?.color ||
            `hsl(var(--chart-${index % 5}))`
          }
          data-testid={`pie-cell-${index}`}
        />
      ))}
    </RechartsPie>
  )
})
Pie.displayName = "Pie"

const PieLabel = React.forwardRef<
  SVGTextElement,
  Omit<React.ComponentProps<typeof Label>, "children"> & {
    children?:
      | React.ReactNode
      | ((props: {
          percent?: number
          payload?: any
        }) => React.ReactNode)
  }
>((props, ref) => {
  if (typeof props.children === "function") {
    return (
      // @ts-ignore
      <Label
        ref={ref}
        {...props}
        formatter={(value: string, payload: any[]) => {
          const entry = payload[0]
          const { payload: originalPayload, percent } = entry
          return props.children?.({
            payload: originalPayload,
            percent,
          }) as React.ReactNode
        }}
      />
    )
  }

  return <Label ref={ref} {...props} />
})
PieLabel.displayName = "PieLabel"

const PieLabelList = Label

const PieActiveSector = Sector

const ChartTooltipContentWrapper = React.forwardRef<
  HTMLDivElement,
  RechartsTooltipProps<any, any>
>(({ active, payload, label, ...props }, ref) => {
  if (!active || !payload?.length) {
    return null
  }
  return <ChartTooltipContent {...props} payload={payload} />
})
ChartTooltipContentWrapper.displayName = "ChartTooltipContentWrapper"

export {
  Chart,
  ChartContainer,
  ChartStyle,
  ChartLegend,
  ChartLegendContext,
  ChartTooltip,
  ChartTooltipContent,
  ChartTooltipFrame,
  ChartTooltipItem,
  ChartTooltipPortal,
  useChartLegend,
  PieChart,
  Pie,
  PieLabel,
  PieLabelList,
  PieActiveSector,
}

// Re-export zod for convenience
export *from "zod"
