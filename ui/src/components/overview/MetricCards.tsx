import { ActivityIcon, CoinsIcon, CpuIcon, GaugeIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { fmtCredits, fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"

export interface MetricValues {
  requests: number
  tokens: number
  credits: number
}

export interface MetricCardsProps {
  today: MetricValues
  /** 昨日数据；没有记录时为 undefined，不显示对比。 */
  yesterday?: MetricValues
  rpm: number
}

function Delta({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === 0) {
    return (
      <span>
        {previous === 0 && current === 0
          ? strings.overview.vsYesterday(strings.overview.flat)
          : strings.overview.noYesterday}
      </span>
    )
  }
  const rounded = Math.round(((current - previous) / previous) * 100)
  const text = rounded === 0 ? strings.overview.flat : `${rounded > 0 ? "+" : ""}${rounded}%`
  return (
    <span className={cn(rounded > 0 && "text-text-success")}>
      {strings.overview.vsYesterday(text)}
    </span>
  )
}

export function MetricCards({ today, yesterday, rpm }: MetricCardsProps) {
  const metrics = [
    {
      label: strings.overview.requestsToday,
      value: fmtNumber(today.requests),
      icon: ActivityIcon,
      foot: <Delta current={today.requests} previous={yesterday?.requests} />,
    },
    {
      label: strings.overview.tokensToday,
      value: fmtNumber(today.tokens),
      icon: CpuIcon,
      foot: <Delta current={today.tokens} previous={yesterday?.tokens} />,
    },
    {
      label: strings.overview.creditsToday,
      value: fmtCredits(today.credits),
      icon: CoinsIcon,
      foot: <Delta current={today.credits} previous={yesterday?.credits} />,
    },
    {
      label: strings.overview.currentRpm,
      value: fmtNumber(rpm),
      icon: GaugeIcon,
      foot: <span>{strings.overview.metricHintRpm}</span>,
    },
  ]

  return (
    <Card className="grid grid-cols-2 gap-0 overflow-hidden p-0 md:grid-cols-4">
      {metrics.map((metric, index) => {
        const Icon = metric.icon
        return (
          <div
            key={metric.label}
            className={cn(
              "flex min-w-0 flex-col gap-1.5 p-4",
              index % 2 === 1 && "border-l border-border",
              index >= 2 && "border-t border-border md:border-t-0",
              index > 0 && "md:border-l md:border-border",
            )}
          >
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
              {metric.label}
            </div>
            <span className="num truncate text-[23px] leading-tight font-semibold tracking-[-0.01em]">
              {metric.value}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">{metric.foot}</span>
          </div>
        )
      })}
    </Card>
  )
}
