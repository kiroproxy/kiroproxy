import { lazy, Suspense } from "react"
import { Link } from "react-router-dom"
import { ChartLineIcon } from "lucide-react"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { strings } from "@/lib/strings"
import { lastSevenDays } from "@/lib/usage"

// 图表依赖（recharts 及其 d3 / redux 依赖）约 1MB 源码，单独拆包，概览首屏不必等它。
const UsageAreaChart = lazy(() => import("@/components/charts/UsageAreaChart"))
import type { DailySummary } from "@/lib/types"

export function UsageTrend({ daily }: { daily: DailySummary[] }) {
  const points = lastSevenDays(daily)
  const empty = points.every((point) => point.input === null)

  return (
    <Card className="h-full gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>{strings.overview.usageTrend}</CardTitle>
          <CardDescription className="mt-1">{strings.overview.trendHint}</CardDescription>
        </div>
        <Link to="/usage" className="text-[12px] font-medium text-primary hover:underline">
          {strings.overview.viewUsage}
        </Link>
      </div>

      {empty ? (
        <Empty className="min-h-[220px] bg-subtle/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartLineIcon />
            </EmptyMedia>
            <EmptyTitle>{strings.overview.noUsage}</EmptyTitle>
            <EmptyDescription>{strings.overview.noUsageHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Suspense fallback={<Skeleton className="min-h-[220px] w-full flex-1" />}>
          <UsageAreaChart data={points} className="aspect-auto min-h-[220px] w-full flex-1" />
        </Suspense>
      )}
    </Card>
  )
}
