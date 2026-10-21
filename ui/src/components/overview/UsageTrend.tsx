import { Card, CardTitle } from "@/components/ui/card"
import { UsageAreaChart } from "@/components/charts/UsageAreaChart"
import { strings } from "@/lib/strings"
import type { DailySummary } from "@/lib/types"

export interface UsageTrendProps {
  daily: DailySummary[]
}

export function UsageTrend({ daily }: UsageTrendProps) {
  const points = daily.slice(-7).map((day) => ({
    date: day.date.slice(5),
    input: day.totalInputTokens,
    output: day.totalCacheReadTokens,
  }))

  return (
    <Card className="gap-2 p-5">
      <CardTitle>{strings.overview.usageTrend}</CardTitle>
      {points.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-[12.5px] text-muted-foreground">
          {strings.common.empty}
        </p>
      ) : (
        <UsageAreaChart data={points} />
      )}
    </Card>
  )
}
