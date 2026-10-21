import { ActivityIcon, CoinsIcon, CpuIcon, GaugeIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"

export interface MetricCardsProps {
  requests: number
  tokens: number
  credits: number
  rpm: number
}

export function MetricCards({ requests, tokens, credits, rpm }: MetricCardsProps) {
  const metrics = [
    { label: strings.overview.requestsToday, value: fmtNumber(requests), icon: ActivityIcon, hint: "今日" },
    { label: strings.overview.tokensToday, value: fmtNumber(tokens), icon: CpuIcon, hint: "输入 Token" },
    { label: strings.overview.creditsToday, value: credits.toFixed(2), icon: CoinsIcon, hint: "Kiro Credits" },
    { label: strings.overview.currentRpm, value: fmtNumber(rpm), icon: GaugeIcon, hint: "最近一分钟" },
  ]

  return (
    <Card className="grid grid-cols-2 gap-0 overflow-hidden p-0 md:grid-cols-4">
      {metrics.map((metric, index) => {
        const Icon = metric.icon
        return (
          <div
            key={metric.label}
            className={cn(
              "flex flex-col gap-2 p-4",
              index % 2 === 1 && "border-l border-border",
              index >= 2 && "border-t border-border md:border-t-0",
              index > 0 && "md:border-l md:border-border",
            )}
          >
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <Icon className="size-3.5" />
              {metric.label}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="num text-[26px] leading-none font-bold">{metric.value}</span>
              <span className="text-[10.5px] text-faint">{metric.hint}</span>
            </div>
          </div>
        )
      })}
    </Card>
  )
}
