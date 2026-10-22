import { toast } from "sonner"
import { AlertList } from "@/components/overview/AlertList"
import { ConnectCard } from "@/components/overview/ConnectCard"
import { CurrentAccount } from "@/components/overview/CurrentAccount"
import { MetricCards, type MetricValues } from "@/components/overview/MetricCards"
import { OnboardingCard } from "@/components/overview/OnboardingCard"
import { StatusCard } from "@/components/overview/StatusCard"
import { UsageTrend } from "@/components/overview/UsageTrend"
import { shiftDays } from "@/lib/format"
import { useAccounts, useDailyUsage, useRpm, useServerStatus, useStartProxy } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { DailySummary } from "@/lib/types"

function metricsOf(day?: DailySummary): MetricValues | undefined {
  if (!day) return undefined
  return { requests: day.totalRequests, tokens: day.totalInputTokens, credits: day.totalCredits }
}

export function OverviewPage() {
  const accounts = useAccounts()
  const daily = useDailyUsage()
  const rpm = useRpm()
  const server = useServerStatus()
  const start = useStartProxy()

  const status = server.data
  const baseUrl = status?.baseUrl || `http://${status?.host ?? "127.0.0.1"}:${status?.port ?? 5678}`
  const byDate = new Map((daily.data ?? []).map((day) => [day.date, day]))
  const today = metricsOf(byDate.get(shiftDays(0))) ?? { requests: 0, tokens: 0, credits: 0 }
  const yesterday = metricsOf(byDate.get(shiftDays(-1)))
  const noAccounts = accounts.data?.total === 0

  return (
    <section aria-label={strings.overview.title} className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
        <StatusCard
          status={status}
          available={accounts.data?.available ?? 0}
          total={accounts.data?.total ?? 0}
          starting={start.isPending}
          onStart={() =>
            start.mutate(undefined, { onSuccess: () => toast.success(strings.settings.started) })
          }
        />
        {noAccounts ? <OnboardingCard /> : <ConnectCard baseUrl={baseUrl} />}
      </div>

      <MetricCards today={today} yesterday={yesterday} rpm={rpm.data?.global ?? 0} />

      <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
        <UsageTrend daily={daily.data ?? []} />
        <div className="flex flex-col gap-3">
          {noAccounts ? <ConnectCard baseUrl={baseUrl} /> : <CurrentAccount accounts={accounts.data} />}
          <AlertList accounts={accounts.data} />
        </div>
      </div>
    </section>
  )
}
