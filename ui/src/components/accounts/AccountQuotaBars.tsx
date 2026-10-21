import { accountQuota, quotaLabel } from "@/lib/account-status"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"
import type { CredentialStatusItem } from "@/lib/types"

function barTone(value: number | null): string {
  if (value === null) return "bg-faint/40"
  if (value >= 100) return "bg-danger"
  if (value >= 90) return "bg-warning"
  return "bg-quota"
}

function QuotaBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-4 shrink-0 text-[10px] text-faint">{label}</span>
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-quota-track">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", barTone(value))}
          style={{ width: `${value === null ? 0 : Math.min(value, 100)}%` }}
        />
      </span>
      <span className="num w-8 text-right text-[11px] text-muted-foreground">
        {quotaLabel(value)}
      </span>
    </div>
  )
}

export function AccountQuotaBars({ item }: { item: CredentialStatusItem }) {
  const quota = accountQuota(item)
  const unknown = quota.fiveHour === null && quota.sevenDay === null
  return (
    <div
      className="flex flex-col gap-1"
      title={unknown ? strings.overview.quotaUnknown : undefined}
    >
      <QuotaBar label="5h" value={quota.fiveHour} />
      <QuotaBar label="7d" value={quota.sevenDay} />
    </div>
  )
}
