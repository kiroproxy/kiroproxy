import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { QuotaRing } from "@/components/charts/QuotaRing"
import { accountName, accountQuota, accountStatus, quotaLabel } from "@/lib/account-status"
import { strings } from "@/lib/strings"
import type { AccountsResponse } from "@/lib/types"

export interface CurrentAccountProps {
  accounts?: AccountsResponse
}

export function CurrentAccount({ accounts }: CurrentAccountProps) {
  const current =
    accounts?.credentials.find((item) => item.id === accounts.currentId) ??
    accounts?.credentials.find((item) => item.isCurrent)

  if (!current) {
    return (
      <Card className="justify-center p-5">
        <span className="text-[13px] text-muted-foreground">{strings.overview.noCurrentAccount}</span>
      </Card>
    )
  }

  const info = accountStatus(current)
  const quota = accountQuota(current)
  const initial = accountName(current).slice(0, 1).toUpperCase()

  return (
    <Card className="gap-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar size="lg">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{accountName(current)}</p>
            <p className="num text-[11.5px] text-muted-foreground">
              {strings.accounts.priorityLabel} #{current.priority + 1}
            </p>
          </div>
        </div>
        <Badge variant={info.variant}>{info.label}</Badge>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <QuotaRing size={112} fiveHour={quota.fiveHour ?? 0} sevenDay={quota.sevenDay ?? 0} />
        <div className="grid min-w-0 flex-1 gap-2.5 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{strings.overview.quotaFiveHour}</span>
            <span className="num font-semibold">{quotaLabel(quota.fiveHour)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{strings.overview.quotaSevenDay}</span>
            <span className="num font-semibold">{quotaLabel(quota.sevenDay)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{strings.overview.quotaResetAt}</span>
            <span className="num">—</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{strings.overview.balance}</span>
            <span className="num">—</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
