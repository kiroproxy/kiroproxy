import { hasQuota, quotaTone } from "@/lib/account-status"
import { fmtNumber, fmtPercent } from "@/lib/format"
import { useAccountBalance } from "@/lib/queries"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"
import type { BalanceResponse } from "@/lib/types"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const toneClass = {
  quota: "bg-quota",
  warning: "bg-warning",
  danger: "bg-danger",
} as const

function resetDate(balance: BalanceResponse): string | null {
  if (!balance.nextResetAt) return null
  return new Date(balance.nextResetAt * 1000).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  })
}

/** 月度额度条：使用率进度 + 「已用 / 限额」，悬停显示重置日期。 */
export function QuotaBar({ balance, className }: { balance: BalanceResponse; className?: string }) {
  const percent = Math.min(Math.max(balance.usagePercentage, 0), 100)
  const reset = resetDate(balance)
  const bar = (
    <div className={cn("flex min-w-[150px] flex-col gap-1", className)}>
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="num font-medium">
          {strings.accounts.quotaUsedOf(
            fmtNumber(Math.round(balance.currentUsage)),
            fmtNumber(Math.round(balance.usageLimit)),
          )}
        </span>
        <span className="num text-muted-foreground">{fmtPercent(balance.usagePercentage)}</span>
      </div>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-quota-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label={strings.a11y.quotaRing(fmtPercent(balance.usagePercentage))}
      >
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300",
            toneClass[quotaTone(balance.usagePercentage)],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
  if (!reset) return bar
  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>{bar}</TooltipTrigger>
      <TooltipContent>{strings.accounts.quotaResetHint(reset)}</TooltipContent>
    </Tooltip>
  )
}

/** 账号列表里的本月额度单元格：自己查询余额（后端缓存 5 分钟）。 */
export function AccountQuotaCell({ id, enabled = true }: { id: number; enabled?: boolean }) {
  const balance = useAccountBalance(id, enabled)
  if (!enabled && !balance.data) {
    return (
      <span className="text-[11.5px] text-muted-foreground" title={strings.accounts.quotaSkipped}>
        —
      </span>
    )
  }
  if (balance.isLoading) return <Skeleton className="h-6 w-[150px]" />
  if (balance.isError) {
    return (
      <span className="text-[11.5px] text-muted-foreground" title={balance.error.message}>
        {strings.accounts.quotaFailed}
      </span>
    )
  }
  if (!hasQuota(balance.data)) {
    return <span className="text-[11.5px] text-muted-foreground">{strings.accounts.quotaUnsupported}</span>
  }
  return <QuotaBar balance={balance.data} />
}
