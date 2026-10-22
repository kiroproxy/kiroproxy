import { Link } from "react-router-dom"
import { ArrowRightIcon } from "lucide-react"
import { AccountQuotaCell } from "@/components/accounts/AccountQuotaBars"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardTitle } from "@/components/ui/card"
import { accountName, accountStatus } from "@/lib/account-status"
import { fmtDateTime, fmtNumber } from "@/lib/format"
import { useAccountBalance } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { AccountsResponse, CredentialStatusItem } from "@/lib/types"

function CurrentAccountBody({ current }: { current: CredentialStatusItem }) {
  const balance = useAccountBalance(current.id)
  const status = accountStatus(current, balance.data)
  return (
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
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="flex flex-col gap-2 rounded-[10px] bg-subtle/70 p-3 text-[11.5px]">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">{strings.overview.monthlyQuota}</span>
          <AccountQuotaCell id={current.id} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border/70 pt-2">
          <span className="text-muted-foreground">{strings.overview.lastUsed}</span>
          <span className="num text-right">{fmtDateTime(current.lastUsedAt)}</span>
          <span className="text-muted-foreground">{strings.overview.successCount}</span>
          <span className="num text-right">{fmtNumber(current.successCount)}</span>
        </div>
      </div>
    </>
  )
}

export function CurrentAccount({ accounts }: { accounts?: AccountsResponse }) {
  const current =
    accounts?.credentials.find((item) => item.id === accounts.currentId) ??
    accounts?.credentials.find((item) => item.isCurrent)

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>{strings.overview.currentAccount}</CardTitle>
        <Link
          to="/accounts"
          className="inline-flex items-center gap-0.5 text-[12px] font-medium text-primary hover:underline"
        >
          {strings.overview.manage}
          <ArrowRightIcon className="size-3" aria-hidden="true" />
        </Link>
      </div>

      {!current ? (
        <div className="flex h-[96px] flex-col items-center justify-center gap-1 rounded-[12px] bg-subtle/60 text-center">
          <span className="text-[12.5px] text-muted-foreground">{strings.overview.noCurrentAccount}</span>
          <Link to="/accounts" className="text-[12px] font-medium text-primary hover:underline">
            {strings.overview.goAddAccount}
          </Link>
        </div>
      ) : (
        <CurrentAccountBody current={current} />
      )}
    </Card>
  )
}
