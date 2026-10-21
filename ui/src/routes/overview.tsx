import { AlertList } from "@/components/overview/AlertList"
import { ConnectCard } from "@/components/overview/ConnectCard"
import { CurrentAccount } from "@/components/overview/CurrentAccount"
import { MetricCards } from "@/components/overview/MetricCards"
import { OnboardingCard } from "@/components/overview/OnboardingCard"
import { StatusCard } from "@/components/overview/StatusCard"
import { UsageTrend } from "@/components/overview/UsageTrend"
import { useAccounts, useDailyUsage, useRpm, useServerStatus } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { ServerStatus } from "@/lib/types"

const FALLBACK_SERVER: ServerStatus = {
  running: false,
  host: "127.0.0.1",
  port: 5678,
  baseUrl: "http://127.0.0.1:5678",
}

function todayString(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function OverviewPage() {
  const accounts = useAccounts()
  const daily = useDailyUsage()
  const rpm = useRpm()
  const serverQuery = useServerStatus()

  const server = serverQuery.data ?? FALLBACK_SERVER
  const baseUrl = server.baseUrl || `http://${server.host}:${server.port}`
  const today = daily.data?.find((item) => item.date === todayString())
  const noAccounts = accounts.data?.total === 0

  return (
    <section aria-label={strings.overview.title} className="flex flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
        <StatusCard status={server} available={accounts.data?.available ?? 0} />
        {noAccounts ? <OnboardingCard /> : <ConnectCard baseUrl={baseUrl} />}
      </div>

      <MetricCards
        requests={today?.totalRequests ?? 0}
        tokens={today?.totalInputTokens ?? 0}
        credits={today?.totalCredits ?? 0}
        rpm={rpm.data?.global ?? 0}
      />

      <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
        <UsageTrend daily={daily.data ?? []} />
        <div className="flex flex-col gap-3">
          {noAccounts ? (
            <ConnectCard baseUrl={baseUrl} />
          ) : (
            <CurrentAccount accounts={accounts.data} />
          )}
          <AlertList accounts={accounts.data} />
        </div>
      </div>
    </section>
  )
}
