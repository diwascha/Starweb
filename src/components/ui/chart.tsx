"use client"

import * as React from "react"
import {
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  Cell,
} from "recharts"
import type { PieProps as RechartsPieProps } from "recharts"

import {
  ChartConfig,
  ChartContainer,
  useChart,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart-core"
import { cn } from "@/lib/utils"

// Explicitly re-export for consumers
export type { ChartConfig }

const Chart = ChartContainer

const ChartLegendContext = React.createContext<
  | {
      label: string | number | React.ReactNode;
      color?: string;
      icon?: React.ComponentType;
      value?: string | number;
      payload: any;
    }[]
  | null
>(null)

function useChartLegend() {
  const context = React.useContext(ChartLegendContext)

  if (!context) {
    return null;
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
      {legend.map(({ label, color, icon: Icon, value }, index) => {
        const IconComponent = Icon as any;
        return (
          <div
            key={label as string}
            data-testid={`chart-legend-item-${index}`}
            className="flex items-center gap-1.5"
          >
            {IconComponent ? (
              <div
                className="h-3.5 w-3.5"
                style={
                  {
                    "--color-foreground": "hsl(var(--muted-foreground))",
                    "--color-primary": color,
                  } as React.CSSProperties
                }
              >
                  <IconComponent />
              </div>
            ) : (
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: color,
                }}
              />
            )}
            {label as React.ReactNode}
            {value && <div className="font-medium">{value}</div>}
          </div>
        )
      })}
    </div>
  )
})
ChartLegend.displayName = "ChartLegend"

const PieChart = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPieChart> & {
    config: ChartConfig
    children: React.ReactNode
    "data-testid"?: string
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
    <ChartLegendContext.Provider value={legend as any}>
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
  any,
  Omit<RechartsPieProps, "activeShape" | "inactiveShape"> & {
    activeShape?: any
    inactiveShape?: any
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
    (props: any) => {
      const { activeShape: ActiveShape } = props as any

      if (!ActiveShape) {
        return null
      }

      if (typeof ActiveShape === 'function') {
          return ActiveShape(props);
      }

      return React.isValidElement(ActiveShape) ? (ActiveShape as any) : null;
    },
    [props.activeShape]
  )

  const renderInactiveShape = React.useCallback(
    (props: any) => {
      const { inactiveShape: InactiveShape } = props as any

      if (!InactiveShape) {
        return null
      }

      if (typeof InactiveShape === 'function') {
          return InactiveShape(props);
      }

      return React.isValidElement(InactiveShape) ? (InactiveShape as any) : null;
    },
    [props.inactiveShape]
  )

  return (
    <RechartsPie
      {...props}
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
      {props.data?.map((entry: any, index: number) => (
        <Cell
          key={`cell-${index}`}
          fill={
            config?.[(entry as any).name]?.color ||
            `hsl(var(--chart-${(index % 5) + 1}))`
          }
          data-testid={`pie-cell-${index}`}
        />
      ))}
    </RechartsPie>
  )
})
Pie.displayName = "Pie"

export {
  Chart,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  PieChart,
  Pie,
}