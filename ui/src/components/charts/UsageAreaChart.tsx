import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { fmtCompact, fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"
import type { TrendPoint } from "@/lib/usage"

const chartConfig = {
  input: { label: strings.usage.inputTokens, color: "var(--chart-1)" },
  cache: { label: strings.usage.cacheRead, color: "var(--chart-2)" },
} satisfies ChartConfig

export default function UsageAreaChart({ data, className }: { data: TrendPoint[]; className?: string }) {
  const summary = data
    .map(
      (point) =>
        `${point.date} ${strings.usage.inputTokens} ${fmtNumber(point.input ?? 0)}，${strings.usage.cacheRead} ${fmtNumber(point.cache ?? 0)}`,
    )
    .join("；")
  return (
    <ChartContainer
      config={chartConfig}
      className={className ?? "aspect-auto h-[220px] w-full"}
      role="img"
      aria-label={strings.a11y.chartSummary(summary)}
    >
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickCount={4}
          tickFormatter={(value: number) => fmtCompact(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                  </span>
                  <span className="num font-medium text-foreground">{fmtNumber(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend
          verticalAlign="bottom"
          align="left"
          itemSorter={null}
          content={<ChartLegendContent className="justify-start" />}
        />
        <Area
          dataKey="input"
          type="monotone"
          stroke="var(--color-input)"
          fill="var(--color-input)"
          fillOpacity={0.16}
          strokeWidth={2}
          connectNulls={false}
        />
        <Line
          dataKey="cache"
          type="monotone"
          stroke="var(--color-cache)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
