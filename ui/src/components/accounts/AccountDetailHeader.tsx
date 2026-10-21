import { ArrowLeftIcon, PencilIcon, RefreshCwIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AccountStatusBadge } from "@/components/accounts/AccountStatusBadge"
import { accountName } from "@/lib/account-status"
import { strings } from "@/lib/strings"
import type { CredentialStatusItem } from "@/lib/types"

export function AccountDetailHeader({
  item,
  onEdit,
  onRefresh,
  refreshing,
}: {
  item: CredentialStatusItem
  onEdit: () => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        aria-label={strings.common.back}
        onClick={() => navigate("/accounts")}
      >
        <ArrowLeftIcon />
      </Button>
      <h2 className="font-serif text-[17px] font-semibold tracking-[-0.01em]">
        {accountName(item)}
      </h2>
      <AccountStatusBadge item={item} />
      {item.isCurrent ? <Badge variant="info">{strings.status.current}</Badge> : null}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="secondary" onClick={onRefresh} disabled={refreshing}>
          <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} />
          {strings.common.refresh}
        </Button>
        <Button onClick={onEdit}>
          <PencilIcon />
          {strings.common.edit}
        </Button>
      </div>
    </div>
  )
}
