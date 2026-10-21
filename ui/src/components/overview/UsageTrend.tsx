import { Link } from "react-router-dom"
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
    <Card className="gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>{strings.overview.usageTrend}</CardTitle>
          <p className="mt-1 text-[11.5px] text-muted-foreground">最近 7 天的输入与缓存读取</p>
        </div>
        <Link to="/usage" className="text-[11.5px] font-medium text-primary hover:underline">
          查看用量
        </Link>
      </div>

      {points.length === 0 ? (
        <div className="flex h-[190px] flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border bg-subtle/40">
          <span className="text-[13px] font-medium text-muted-foreground">还没有用量记录</span>
          <span className="text-[11.5px] text-faint">
            接入 Claude Code 后，这里会出现每日趋势
          </span>
        </div>
      ) : (
        <UsageAreaChart data={points} />
      )}
    </Card>
  )
}
