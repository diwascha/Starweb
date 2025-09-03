
"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { z as zod } from "zod"

import { cn } from "@/lib/utils"

// Format: YYYY-MM-DD HH:MM:SS
const DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/
const ZOD_DATE_PREPROCESS = (arg: unknown) => {
  if (typeof arg === "string") {
    if (DATE_REGEX.test(arg)) {
      return new Date(arg)
    }
  }
  return arg
}
const ChartStyle = zod.object({
  /**
   * The CSS class name to apply to the chart.
   */
  className: zod.string().optional(),
  /**
   * The CSS styles to apply to the chart.
   */
  style: zod.record(zod.string(), zod.any()).optional(),
  /**
   * The CSS variables to apply to the chart.
   */
  variables: zod
    .record(zod.string(), zod.record(zod.string(), zod.string()))
    .optional(),
})

// TODO: Use zod transform to apply default values.
const ChartTooltip = zod.object({
  /**
   * Whether the tooltip is shared across all data series.
   */
  shared: zod.boolean().default(true),
  /**
   * The label to display on the tooltip.
   */
  label: zod.string().optional(),
  /**
   * The formatter function for the label.
   */
  labelFormatter: zod.function().optional(),
  /**
   * The formatter function for the value.
   */
  valueFormatter: zod.function().optional(),
  /**
   * The style of the tooltip.
   */
  style: ChartStyle.optional(),
})

const ChartLabel = zod.object({
  /**
   * The value of the label.
   * Can be a string or a number.
   */
  value: zod.union([zod.string(), zod.number()]),
  /**
   * The position of the label.
   */
  position: zod
    .enum([
      "top",
      "bottom",
      "left",
      "right",
      "center",
      "inside",
      "outside",
      "insideTop",
      "insideBottom",
      "insideLeft",
      "insideRight",
      "insideTopLeft",
      "insideTopRight",
      "insideBottomLeft",
      "insideBottomRight",
      "insideStart",
      "insideEnd",
      "centerTop",
    ])
    .optional(),
  /**
   * The offset of the label from its position.
   */
  offset: zod.number().optional(),
  /**
   * The angle of the label.
   */
  angle: zod.number().optional(),
  /**
   * The style of the label.
   */
  style: ChartStyle.optional(),
})

// Zod schema for chart configuration
const ChartConfig = zod.record(
  zod.string(),
  zod.object({
    /**
     * The label for the chart item.
     * Can be a string, a number, or a React node.
     */
    label: zod.union([zod.string(), zod.number(), zod.custom<React.ReactNode>()]),
    /**
     * The color of the chart item.
     * Can be any valid CSS color.
     */
    color: zod.string().optional(),
    /**
     * The icon for the chart item.
     * Must be a valid React component.
     */
    icon: zod.custom<React.ComponentType>().optional(),
    /**
     * The style of the chart item.
     */
    style: ChartStyle.optional(),
    /**
     * The tooltip configuration for the chart item.
     */
    tooltip: ChartTooltip.optional(),
    /**
     * The label configuration for the chart item.
     */
    labelConfig: ChartLabel.optional(),
  })
)

type ChartConfig = zod.infer<typeof ChartConfig>

const ChartContext = React.createContext<{
  config: ChartConfig
}>({
  config: {},
})

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"]
    "data-testid"?: string
  }
>(({ id, "data-testid": testId, className, children, config, ...props }, ref) => {
  const chartId = React.useId()
  const idValue = id || chartId

  const classNames = React.useMemo(
    () =>
      Object.entries(config).map(([key, value]) => {
        const color =
          value.color || `hsl(var(--chart-${(Number(key) % 5) + 1}))`
        return `.${idValue} .recharts-bar-${key} {--color: ${color}; fill: ${color}; } .${idValue} .recharts-area-${key} {--color: ${color}; fill: ${color}; } .${idValue} .recharts-line-${key} {--color: ${color}; stroke: ${color}; } .${idValue} .recharts-dot-${key} {--color: ${color}; fill: ${color}; }`
      }),
    [config, idValue]
  )

  return (
    <ChartContext.Provider value={{ config }}>
      <style>{classNames.join("\n")}</style>
      <div
        ref={ref}
        data-testid={testId}
        className={cn(
          `[--chart-padding:theme(spacing.4)] ${idValue}`,
          "flex aspect-video justify-center text-xs",
          className
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

const ChartTooltipFrame = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  )
})
ChartTooltipFrame.displayName = "ChartTooltipFrame"

const ChartTooltipItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    color?: string
    name?: string
    value?: string
    unit?: string
    "data-testid"?: string
  }
>(({ className, color, name, value, unit, "data-testid": testId }, ref) => {
  return (
    <div
      ref={ref}
      data-testid={testId}
      className={cn("flex items-center gap-2", className)}
    >
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
        style={{
          backgroundColor: color,
        }}
      />
      <div className="flex flex-1 justify-between">
        <p className="text-muted-foreground">{name}</p>
        <p className="font-medium">
          {value}
          <span className="ml-1 text-muted-foreground">{unit}</span>
        </p>
      </div>
    </div>
  )
})
ChartTooltipItem.displayName = "ChartTooltipItem"

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      indicator?: "line" | "dot" | "dashed"
      hideLabel?: boolean
      hideIndicator?: boolean
      labelKey?: string
      "data-testid"?: string
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
      "data-testid": testId,
    },
    ref
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload || payload.length === 0) {
        return null
      }

      const [item] = payload
      const key = `${labelKey || item.dataKey}`
      const itemConfig = config[key]

      if (itemConfig?.tooltip?.label) {
        return itemConfig.tooltip.label
      }

      if (label) {
        return label
      }

      if (labelFormatter) {
        return labelFormatter(item.value, payload)
      }

      return item.payload[key]
    }, [label, labelFormatter, payload, hideLabel, config, labelKey])

    if (!active || !payload || payload.length === 0) {
      return null
    }

    const nestLabel = payload.length > 1

    return (
      <ChartTooltipFrame
        ref={ref}
        data-testid={testId}
        className={cn("min-w-[8rem]", className)}
      >
        {tooltipLabel ? (
          <div className={cn("mb-1.5", labelClassName)}>{tooltipLabel}</div>
        ) : null}
        <div className="space-y-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey}`
            const itemConfig = config[key]
            const indicatorColor =
              color || item.color || itemConfig?.color

            return (
              <ChartTooltipItem
                key={item.dataKey}
                data-testid={`tooltip-item-${index}`}
                name={
                  itemConfig?.label ||
                  (item.name as React.ReactNode)
                }
                value={
                  formatter
                    ? formatter(item.value, item.name, item, index, payload)
                    : item.value
                }
                unit={""}
                color={indicatorColor}
              />
            )
          })}
        </div>
      </ChartTooltipFrame>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltipContent"

export {
  ChartStyle,
  ChartTooltip,
  ChartLabel,
  DATE_REGEX,
  ZOD_DATE_PREPROCESS,
  ChartConfig,
  ChartContainer,
  ChartContext,
  useChart,
  ChartTooltipFrame,
  ChartTooltipItem,
  ChartTooltipContent,
}

    