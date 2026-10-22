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
    if (accountStatus(item).status === "needsLogin") {
      rows.push({
        key: `${item.id}-login`,
        accountId: item.id,
        label: name,
        detail: strings.overview.alertNeedsLogin,
        tone: "info",
      })
      continue
    }
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
  }
  const order = { danger: 0, info: 1, warning: 2 }
  return rows.sort((a, b) => order[a.tone] - order[b.tone])
}

const TONE_CLASS: Record<AlertRow["tone"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
}

export function AlertList({ accounts }: { accounts?: AccountsResponse }) {
  const alerts = buildAlerts(accounts)

  return (
    <Card className="flex-1 gap-2 p-5">
      <CardTitle>{strings.overview.alerts}</CardTitle>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 py-3 text-[12.5px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          {strings.overview.noAlerts}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {alerts.map((alert) => (
            <li
              key={alert.key}
              className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 text-[12.5px] transition-colors hover:bg-subtle"
            >
              <span
                className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASS[alert.tone])}
                aria-hidden="true"
              />
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
