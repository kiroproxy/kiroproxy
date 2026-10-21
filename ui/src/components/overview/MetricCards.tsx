import { Card } from "@/components/ui/card"
import { fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"

export interface MetricCardsProps {
  requests: number
  tokens: number
  credits: number
  rpm: number
}

export function MetricCards({ requests, tokens, credits, rpm }: MetricCardsProps) {
  const metrics = [
    { label: strings.overview.requestsToday, value: fmtNumber(requests) },
    { label: strings.overview.tokensToday, value: fmtNumber(tokens) },
    { label: strings.overview.creditsToday, value: credits.toFixed(2) },
    { label: strings.overview.currentRpm, value: fmtNumber(rpm) },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="gap-1.5 p-3.5">
          <span className="text-[11.5px] text-muted-foreground">{metric.label}</span>
          <span className="num text-[23px] leading-none font-bold">{metric.value}</span>
        </Card>
      ))}
    </div>
  )
}
