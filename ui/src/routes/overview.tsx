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

export function OverviewPage() {
  const accounts = useAccounts()
  const daily = useDailyUsage()
  const rpm = useRpm()
  const serverQuery = useServerStatus()

  const server = serverQuery.data ?? FALLBACK_SERVER
  const baseUrl = server.baseUrl || `http://${server.host}:${server.port}`
  const today = daily.data?.at(-1)
  const tokens = today?.totalInputTokens ?? 0

  return (
    <section aria-label={strings.overview.title} className="flex flex-col gap-3">
      {accounts.data && accounts.data.total === 0 ? (
        <OnboardingCard />
      ) : (
        <StatusCard status={server} available={accounts.data?.available ?? 0} />
      )}

      <MetricCards
        requests={today?.totalRequests ?? 0}
        tokens={tokens}
        credits={today?.totalCredits ?? 0}
        rpm={rpm.data?.global ?? 0}
      />

      <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <CurrentAccount accounts={accounts.data} />
        <UsageTrend daily={daily.data ?? []} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <AlertList accounts={accounts.data} />
        <ConnectCard baseUrl={baseUrl} />
      </div>
    </section>
  )
}
