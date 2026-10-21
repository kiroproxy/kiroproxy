import { Link } from "react-router-dom"
import { ArrowRightIcon } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardTitle } from "@/components/ui/card"
import { accountName, accountQuota, accountStatus, quotaLabel } from "@/lib/account-status"
import { fmtDateTime, fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"
import type { AccountsResponse } from "@/lib/types"

export interface CurrentAccountProps {
  accounts?: AccountsResponse
}

export function CurrentAccount({ accounts }: CurrentAccountProps) {
  const current =
    accounts?.credentials.find((item) => item.id === accounts.currentId) ??
    accounts?.credentials.find((item) => item.isCurrent)

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>{strings.overview.currentAccount}</CardTitle>
        <Link
          to="/accounts"
          className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-primary hover:underline"
        >
          管理
          <ArrowRightIcon className="size-3" />
        </Link>
      </div>

      {!current ? (
        <div className="flex h-[96px] flex-col items-center justify-center gap-1 rounded-[12px] bg-subtle/60 text-center">
          <span className="text-[12.5px] text-muted-foreground">{strings.overview.noCurrentAccount}</span>
          <Link to="/accounts" className="text-[11.5px] font-medium text-primary hover:underline">
            去添加账号
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <Avatar size="lg">
              <AvatarFallback>{accountName(current).slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold">{accountName(current)}</div>
              <div className="text-[11.5px] text-muted-foreground">
                {strings.accounts.priorityLabel} #{current.priority + 1}
                {current.provider ? ` · ${current.provider}` : ""}
              </div>
            </div>
            <Badge variant={accountStatus(current).variant}>{accountStatus(current).label}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-[10px] bg-subtle/70 p-3 text-[11.5px]">
            <span className="text-muted-foreground">最近使用</span>
            <span className="num text-right">{fmtDateTime(current.lastUsedAt)}</span>
            <span className="text-muted-foreground">成功次数</span>
            <span className="num text-right">{fmtNumber(current.successCount)}</span>
            <span className="text-muted-foreground">5h / 7d 额度</span>
            <span className="num text-right">
              {quotaLabel(accountQuota(current).fiveHour)} / {quotaLabel(accountQuota(current).sevenDay)}
            </span>
          </div>
        </>
      )}
    </Card>
  )
}
