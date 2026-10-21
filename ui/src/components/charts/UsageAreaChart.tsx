import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"

const chartConfig = {
  input: { label: strings.usage.inputTokens, color: "var(--chart-1)" },
  output: { label: strings.usage.cacheRead, color: "var(--chart-2)" },
} satisfies ChartConfig

export interface UsagePoint {
  date: string
  input: number
  output: number
}

export function UsageAreaChart({ data }: { data: UsagePoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[190px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          width={42}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => fmtNumber(value)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="input"
          type="monotone"
          stroke="var(--color-input)"
          fill="var(--color-input)"
          fillOpacity={0.16}
          strokeWidth={2}
        />
        <Line
          dataKey="output"
          type="monotone"
          stroke="var(--color-output)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
