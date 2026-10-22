import { fmtCost, fmtCredits, fmtNumber, fmtPercent } from "@/lib/format"
import { strings } from "@/lib/strings"
import type { ModelBreakdown } from "@/lib/types"
import { seriesColor } from "@/lib/usage"

/** 按模型的占比排行：横向条从大到小，每行配请求数、占比、Token 与费用。 */
export function ModelBreakdownList({ items }: { items: ModelBreakdown[] }) {
  const total = items.reduce((sum, item) => sum + item.requests, 0)
  if (items.length === 0) {
    return <p className="py-6 text-center text-[12.5px] text-muted-foreground">{strings.usage.noData}</p>
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, index) => {
        const share = total > 0 ? (item.requests / total) * 100 : 0
        return (
          <li key={item.model} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: seriesColor(index) }}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{item.model}</span>
              </span>
              <span className="num shrink-0 text-muted-foreground">
                {strings.common.times(fmtNumber(item.requests))} · {fmtPercent(share)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-quota-track">
              <div
                className="h-full rounded-full"
                style={{ width: `${share}%`, backgroundColor: seriesColor(index) }}
              />
            </div>
            <div className="num flex flex-wrap gap-x-3 text-[11.5px] text-muted-foreground">
              <span>
                {strings.usage.inputTokens} {fmtNumber(item.inputTokens)}
              </span>
              <span>
                {strings.usage.outputTokens} {fmtNumber(item.outputTokens)}
              </span>
              <span>
                {strings.usage.credits} {fmtCredits(item.credits)}
              </span>
              <span>{fmtCost(item.cost)}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
