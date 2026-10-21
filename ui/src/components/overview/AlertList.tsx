import { Link } from "react-router-dom"
import { Card, CardTitle } from "@/components/ui/card"
import { accountName, accountStatus } from "@/lib/account-status"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"
import type { AccountsResponse } from "@/lib/types"

interface AlertRow {
  key: string
  accountId: number
  label: string
  detail: string
  tone: "danger" | "warning" | "info"
}

function buildAlerts(accounts?: AccountsResponse): AlertRow[] {
  if (!accounts) return []
  const rows: AlertRow[] = []
  for (const item of accounts.credentials) {
    const name = accountName(item)
    if (item.failureCount > 0) {
      rows.push({
        key: `${item.id}-failure`,
        accountId: item.id,
        label: name,
        detail: strings.overview.alertFailure(item.failureCount),
        tone: "danger",
      })
    }
    if (item.throttleCount > 0) {
      rows.push({
        key: `${item.id}-throttle`,
        accountId: item.id,
        label: name,
        detail: strings.overview.alertThrottle(item.throttleCount),
        tone: "warning",
      })
    }
    if (accountStatus(item).status === "needsLogin") {
      rows.push({
        key: `${item.id}-login`,
        accountId: item.id,
        label: name,
        detail: strings.overview.alertNeedsLogin,
        tone: "info",
      })
    }
  }
  return rows
}

const TONE_CLASS: Record<AlertRow["tone"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
}

export function AlertList({ accounts }: { accounts?: AccountsResponse }) {
  const alerts = buildAlerts(accounts)

  return (
    <Card className="gap-2 p-5">
      <CardTitle>{strings.overview.alerts}</CardTitle>
      {alerts.length === 0 ? (
        <p className="py-3 text-[12.5px] text-muted-foreground">{strings.overview.noAlerts}</p>
      ) : (
        <div className="flex flex-col">
          {alerts.map((alert) => (
            <div
              key={alert.key}
              className="alert-row flex items-center gap-2.5 rounded-[10px] px-2 py-2 text-[12.5px]"
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASS[alert.tone])} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{alert.label}</span>
                <span className="ml-2 text-muted-foreground">{alert.detail}</span>
              </span>
              <Link
                to={`/accounts/${alert.accountId}`}
                className="shrink-0 text-[12px] font-medium text-primary hover:underline"
              >
                {strings.overview.alertResolve}
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
