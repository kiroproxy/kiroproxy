import { lazy, Suspense, useMemo, useState } from "react"
import { ReceiptTextIcon } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DailyBarChart, type BarSeries, type DailyBar } from "@/components/charts/DailyBarChart"
import { LoadError } from "@/components/shell/LoadError"
import { Pager } from "@/components/shell/Pager"
import { ModelBreakdownList } from "@/components/usage/ModelBreakdownList"
import { UsageRecordsTable } from "@/components/usage/UsageRecordsTable"
import { dateRange, fmtCost, fmtCredits, fmtNumber, shiftDays } from "@/lib/format"
import { useDailyUsage, useUsageBreakdown, useUsageRecords } from "@/lib/queries"
import { strings } from "@/lib/strings"
import { OTHER_COLOR, seriesColor } from "@/lib/usage"

const DateRangePicker = lazy(() => import("@/components/usage/DateRangePicker"))

type RangeKey = "today" | "7d" | "30d" | "custom"
type ChartMode = "total" | "model"

const MAX_MODEL_SERIES = 4

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="num truncate text-[23px] leading-tight font-semibold tracking-[-0.01em]">{value}</div>
    </div>
  )
}

export function UsagePage() {
  const [range, setRange] = useState<RangeKey>("7d")
  const [customFrom, setCustomFrom] = useState(shiftDays(-6))
  const [customTo, setCustomTo] = useState(shiftDays(0))
  const [chartMode, setChartMode] = useState<ChartMode>("total")
  const [page, setPage] = useState(1)

  const { from, to } = useMemo(() => {
    if (range === "today") return { from: shiftDays(0), to: shiftDays(0) }
    if (range === "7d") return { from: shiftDays(-6), to: shiftDays(0) }
    if (range === "30d") return { from: shiftDays(-29), to: shiftDays(0) }
    return { from: customFrom, to: customTo }
  }, [customFrom, customTo, range])

  const daily = useDailyUsage()
  const breakdown = useUsageBreakdown(from, to)
  const records = useUsageRecords({ from, to, page, pageSize: 50 })

  const days = useMemo(() => dateRange(from, to), [from, to])

  const totals = useMemo(() => {
    const rows = (daily.data ?? []).filter((item) => item.date >= from && item.date <= to)
    return rows.reduce(
      (acc, item) => ({
        requests: acc.requests + item.totalRequests,
        input: acc.input + item.totalInputTokens,
        output: acc.output + (item.totalOutputTokens ?? 0),
        cache: acc.cache + item.totalCacheReadTokens,
        cost: acc.cost + item.totalCost,
        credits: acc.credits + item.totalCredits,
      }),
      { requests: 0, input: 0, output: 0, cache: 0, cost: 0, credits: 0 },
    )
  }, [daily.data, from, to])

  const topModels = useMemo(
    () => (breakdown.data?.byModel ?? []).slice(0, MAX_MODEL_SERIES).map((item) => item.model),
    [breakdown.data],
  )

  const { bars, series } = useMemo(() => {
    const byDate = new Map((daily.data ?? []).map((item) => [item.date, item]))
    if (chartMode === "total") {
      const data: DailyBar[] = days.map((date) => ({
        date: date.slice(5),
        requests: byDate.get(date)?.totalRequests ?? null,
      }))
      const totalSeries: BarSeries[] = [
        { key: "requests", label: strings.usage.requests, color: "var(--chart-1)" },
      ]
      return { bars: data, series: totalSeries }
    }
    const perDay = new Map<string, Map<string, number>>()
    for (const row of breakdown.data?.byDayModel ?? []) {
      const key = topModels.includes(row.model) ? row.model : "__other"
      const day = perDay.get(row.date) ?? new Map<string, number>()
      day.set(key, (day.get(key) ?? 0) + row.requests)
      perDay.set(row.date, day)
    }
    const keys = [...topModels]
    const hasOther = (breakdown.data?.byModel ?? []).length > topModels.length
    if (hasOther) keys.push("__other")
    const data: DailyBar[] = days.map((date) => {
      const day = perDay.get(date)
      const point: DailyBar = { date: date.slice(5) }
      keys.forEach((key, index) => {
        point[`m${index}`] = day ? (day.get(key) ?? 0) : null
      })
      return point
    })
    const modelSeries: BarSeries[] = keys.map((key, index) => ({
      key: `m${index}`,
      label: key === "__other" ? strings.usage.other : key,
      color: key === "__other" ? OTHER_COLOR : seriesColor(index),
    }))
    return { bars: data, series: modelSeries }
  }, [breakdown.data, chartMode, daily.data, days, topModels])

  const average = days.length > 1 ? Math.round(totals.requests / days.length) : undefined
  const hasData = totals.requests > 0

  return (
    <section aria-label={strings.usage.title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          variant="filter"
          value={[range]}
          onValueChange={(next) => {
            if (!next[0]) return
            setRange(next[0] as RangeKey)
            setPage(1)
          }}
          aria-label={strings.usage.pickRange}
        >
          <ToggleGroupItem value="today">{strings.usage.today}</ToggleGroupItem>
          <ToggleGroupItem value="7d">{strings.usage.sevenDays}</ToggleGroupItem>
          <ToggleGroupItem value="30d">{strings.usage.thirtyDays}</ToggleGroupItem>
          <ToggleGroupItem value="custom">{strings.usage.custom}</ToggleGroupItem>
        </ToggleGroup>
        {range === "custom" ? (
          <Suspense fallback={<Skeleton className="h-[26px] w-48 rounded-full" />}>
            <DateRangePicker
              from={customFrom}
              to={customTo}
              onChange={(nextFrom, nextTo) => {
                setCustomFrom(nextFrom)
                setCustomTo(nextTo)
                setPage(1)
              }}
            />
          </Suspense>
        ) : null}
      </div>

      <Card className="grid grid-cols-3 gap-4 p-4 md:grid-cols-6">
        <Metric label={strings.usage.requests} value={fmtNumber(totals.requests)} />
        <Metric label={strings.usage.inputTokens} value={fmtNumber(totals.input)} />
        <Metric label={strings.usage.outputTokens} value={fmtNumber(totals.output)} />
        <Metric label={strings.usage.cacheRead} value={fmtNumber(totals.cache)} />
        <Metric label={strings.usage.credits} value={fmtCredits(totals.credits)} />
        <Metric label={strings.usage.cost} value={fmtCost(totals.cost)} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card className="gap-3 p-5">
          <CardHeader className="grid-cols-[1fr_auto] items-center p-0">
            <div>
              <CardTitle>{strings.usage.dailyRequests}</CardTitle>
              <CardDescription className="num mt-1">
                {from} → {to}
                {average ? ` · ${strings.usage.average} ${fmtNumber(average)}` : ""}
              </CardDescription>
            </div>
            <ToggleGroup
              variant="filter"
              value={[chartMode]}
              onValueChange={(next) => {
                if (next[0]) setChartMode(next[0] as ChartMode)
              }}
              aria-label={strings.usage.dailyRequests}
            >
              <ToggleGroupItem value="total">{strings.usage.total}</ToggleGroupItem>
              <ToggleGroupItem value="model">{strings.usage.byModel}</ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          {daily.isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : hasData ? (
            <>
              <DailyBarChart
                data={bars}
                series={series}
                average={chartMode === "total" ? average : undefined}
                valueLabel={strings.usage.dailyRequests}
              />
              {series.length > 1 ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
                  {series.map((item) => (
                    <span key={item.key} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-[2px]" style={{ backgroundColor: item.color }} />
                      {item.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="grid h-[220px] place-items-center text-[12.5px] text-muted-foreground">
              {strings.usage.noData}
            </div>
          )}
        </Card>

        <Card className="gap-3 p-5">
          <CardTitle>{strings.usage.modelBreakdown}</CardTitle>
          {breakdown.isError ? (
            <p className="text-[12px] text-text-danger">{breakdown.error.message}</p>
          ) : breakdown.isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <ModelBreakdownList items={breakdown.data?.byModel ?? []} />
          )}
        </Card>
      </div>

      <div className="flex items-center justify-between pt-1">
        <h2 className="font-serif text-[15px] font-semibold">{strings.usage.recordsTitle}</h2>
        {records.isFetching && !records.isLoading ? (
          <span className="text-[11.5px] text-muted-foreground">{strings.common.loading}</span>
        ) : null}
      </div>
      {records.isError ? (
        <LoadError error={records.error} onRetry={() => void records.refetch()} />
      ) : records.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[16px]" />
      ) : (records.data?.records.length ?? 0) === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptTextIcon />
            </EmptyMedia>
            <EmptyTitle>{strings.usage.noData}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col">
          <UsageRecordsTable records={records.data?.records ?? []} />
          <Pager
            page={records.data?.page ?? page}
            totalPages={records.data?.totalPages ?? 1}
            total={records.data?.total}
            onChange={setPage}
          />
        </div>
      )}
    </section>
  )
}
