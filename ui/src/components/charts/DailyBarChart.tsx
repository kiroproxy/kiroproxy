import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { fmtCompact, fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"

export interface DailyBar {
  /** `MM-DD` */
  date: string
  /** 没有记录的日期为 null，画成空位而不是 0 高度的柱。 */
  [series: string]: string | number | null
}

export interface BarSeries {
  key: string
  label: string
  color: string
}

/**
 * 每日柱状图：柱宽不超过 24px，可叠加多个序列（按模型拆分），虚线标出日均。
 */
export function DailyBarChart({
  data,
  series,
  average,
  valueLabel,
  onSelect,
}: {
  data: DailyBar[]
  series: BarSeries[]
  average?: number
  valueLabel: string
  /** 点击某一天的柱子（参数为 data 中的下标）；用于下钻到当天的调用记录。 */
  onSelect?: (index: number) => void
}) {
  const config = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  ) satisfies ChartConfig
  const stacked = series.length > 1
  const summary = data
    .map((point) => {
      const total = series.reduce((sum, item) => sum + Number(point[item.key] ?? 0), 0)
      return `${point.date} ${fmtNumber(total)}`
    })
    .join("；")

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-[220px] w-full"
      role="img"
      aria-label={strings.a11y.chartSummary(`${valueLabel}：${summary}`)}
    >
      <BarChart data={data} margin={{ left: 4, right: 8, top: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={12}
        />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickCount={4}
          allowDecimals={false}
          tickFormatter={(value: number) => fmtCompact(value)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--subtle)" }}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
                  <span className="num font-medium text-foreground">{fmtNumber(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        {average && average > 0 ? (
          <ReferenceLine y={average} stroke="var(--border-strong)" strokeDasharray="4 4" ifOverflow="extendDomain" />
        ) : null}
        {series.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            stackId={stacked ? "total" : undefined}
            fill={`var(--color-${item.key})`}
            barSize={data.length > 14 ? 14 : 24}
            radius={!stacked || index === series.length - 1 ? [4, 4, 0, 0] : 0}
            className={onSelect ? "cursor-pointer" : undefined}
            onClick={onSelect ? (_, dataIndex) => onSelect(dataIndex) : undefined}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
