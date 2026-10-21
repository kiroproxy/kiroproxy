import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtCost, fmtDateTime, fmtDuration, fmtNumber } from "@/lib/format"
import { useDailyUsage, useUsageRecords } from "@/lib/queries"
import { strings } from "@/lib/strings"

type RangeKey = "today" | "7d" | "30d" | "custom"

function localDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function shiftDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDate(date)
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="num text-[23px] font-bold leading-tight">{value}</div>
    </div>
  )
}

export function UsagePage() {
  const [range, setRange] = useState<RangeKey>("7d")
  const [customFrom, setCustomFrom] = useState(shiftDays(-6))
  const [customTo, setCustomTo] = useState(shiftDays(0))
  const [page, setPage] = useState(1)

  const { from, to } = useMemo(() => {
    if (range === "today") return { from: shiftDays(0), to: shiftDays(0) }
    if (range === "7d") return { from: shiftDays(-6), to: shiftDays(0) }
    if (range === "30d") return { from: shiftDays(-29), to: shiftDays(0) }
    return { from: customFrom, to: customTo }
  }, [customFrom, customTo, range])

  const daily = useDailyUsage()
  const records = useUsageRecords({ from, to, page, pageSize: 50 })

  const days = useMemo(
    () =>
      (daily.data ?? [])
        .filter((item) => item.date >= from && item.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [daily.data, from, to],
  )

  const totals = useMemo(
    () =>
      days.reduce(
        (acc, item) => ({
          requests: acc.requests + item.totalRequests,
          input: acc.input + item.totalInputTokens,
          cache: acc.cache + item.totalCacheReadTokens,
          cost: acc.cost + item.totalCost,
          credits: acc.credits + item.totalCredits,
        }),
        { requests: 0, input: 0, cache: 0, cost: 0, credits: 0 },
      ),
    [days],
  )

  const maxRequests = Math.max(1, ...days.map((item) => item.totalRequests))
  const totalPages = records.data?.totalPages ?? 1

  return (
    <section aria-label={strings.usage.title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={range}
          onValueChange={(value) => {
            setRange(String(value) as RangeKey)
            setPage(1)
          }}
        >
          <TabsList>
            <TabsTrigger value="today">{strings.usage.today}</TabsTrigger>
            <TabsTrigger value="7d">{strings.usage.sevenDays}</TabsTrigger>
            <TabsTrigger value="30d">{strings.usage.thirtyDays}</TabsTrigger>
            <TabsTrigger value="custom">{strings.usage.custom}</TabsTrigger>
          </TabsList>
        </Tabs>
        {range === "custom" ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={customFrom}
              className="w-[150px]"
              onChange={(event) => {
                setCustomFrom(event.target.value)
                setPage(1)
              }}
            />
            <span className="text-[12px] text-muted-foreground">→</span>
            <Input
              type="date"
              value={customTo}
              className="w-[150px]"
              onChange={(event) => {
                setCustomTo(event.target.value)
                setPage(1)
              }}
            />
          </div>
        ) : null}
        <span className="num ml-auto text-[11.5px] text-muted-foreground">
          {from} → {to}
        </span>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-1 md:grid-cols-5">
          <Metric label={strings.usage.requests} value={fmtNumber(totals.requests)} />
          <Metric label={strings.usage.inputTokens} value={fmtNumber(totals.input)} />
          <Metric label={strings.usage.cacheRead} value={fmtNumber(totals.cache)} />
          <Metric label={strings.usage.cost} value={fmtCost(totals.cost)} />
          <Metric label={strings.usage.credits} value={fmtNumber(totals.credits)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex h-40 items-end gap-1.5 pt-1">
          {days.length === 0 ? (
            <span className="self-center text-[12px] text-muted-foreground">
              {strings.common.empty}
            </span>
          ) : null}
          {days.map((item) => (
            <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="num text-[9.5px] text-muted-foreground">{item.totalRequests}</span>
              <div
                className="w-full rounded-t-[4px] bg-quota"
                style={{ height: `${Math.max(4, (item.totalRequests / maxRequests) * 112)}px` }}
                title={`${item.date} · ${item.totalRequests} 次 · ${fmtCost(item.totalCost)}`}
              />
              <span className="num text-[9px] text-faint">{item.date.slice(5)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{strings.usage.columns.time}</TableHead>
              <TableHead>{strings.usage.columns.account}</TableHead>
              <TableHead>{strings.usage.columns.model}</TableHead>
              <TableHead>{strings.usage.columns.tokens}</TableHead>
              <TableHead>{strings.usage.columns.cost}</TableHead>
              <TableHead>{strings.usage.columns.credits}</TableHead>
              <TableHead>{strings.usage.columns.duration}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {strings.common.loading}
                </TableCell>
              </TableRow>
            ) : null}
            {!records.isLoading && (records.data?.records.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {strings.common.empty}
                </TableCell>
              </TableRow>
            ) : null}
            {records.data?.records.map((record, index) => (
              <TableRow key={`${record.createdAt}-${index}`}>
                <TableCell className="num text-muted-foreground">
                  {fmtDateTime(record.createdAt)}
                </TableCell>
                <TableCell className="max-w-[140px] truncate">
                  {record.credentialLabel ?? strings.usage.noAccount}
                </TableCell>
                <TableCell className="max-w-[180px] truncate font-medium">{record.model}</TableCell>
                <TableCell className="num">
                  {fmtNumber(record.inputTokens)} / {fmtNumber(record.outputTokens)} /{" "}
                  {fmtNumber(record.cacheReadInputTokens ?? 0)}
                </TableCell>
                <TableCell className="num">{fmtCost(record.estimatedCost)}</TableCell>
                <TableCell className="num">{fmtNumber(record.creditsUsed ?? 0)}</TableCell>
                <TableCell className="num text-muted-foreground">
                  {record.durationMs ? fmtDuration(record.durationMs / 1000) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 text-[12px] text-muted-foreground">
        <span className="num">{strings.common.pageOf(page, totalPages)}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          {strings.common.prevPage}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((value) => value + 1)}
        >
          {strings.common.nextPage}
        </Button>
      </div>
    </section>
  )
}
