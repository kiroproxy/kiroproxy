import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"
import type { ServerStatus } from "@/lib/types"

export interface StatusCardProps {
  status?: ServerStatus
  available: number
  total: number
}

function uptimeText(startedAt?: string | null): string | null {
  if (!startedAt) return null
  return strings.overview.uptime(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000)))
}

/** 状态光球：运行中为陶土色渐变并缓慢呼吸，停止或出错时变灰。 */
function StatusOrb({ running }: { running: boolean }) {
  return (
    <div className="relative grid size-[120px] shrink-0 place-items-center" aria-hidden="true">
      {running ? (
        <span className="absolute inset-0 animate-[orb-breathe_3.2s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle_at_30%_20%,var(--orb-start),var(--orb-end))] blur-xl" />
      ) : null}
      <div
        className={cn(
          "relative grid size-[104px] place-items-center rounded-full",
          running
            ? "bg-[radial-gradient(circle_at_30%_20%,var(--orb-start),var(--orb-end))] text-primary-foreground shadow-[0_14px_34px_var(--orb-glow)]"
            : "bg-[radial-gradient(circle_at_30%_20%,var(--subtle-hover),var(--border-strong))] text-muted-foreground",
        )}
      >
        <span className="text-[13px] font-semibold tracking-wide">
          {running ? strings.overview.orbRunning : strings.overview.orbStopped}
        </span>
      </div>
    </div>
  )
}

export function StatusCard({ status, available, total }: StatusCardProps) {
  const running = !!status?.running && !status.lastError
  const hasAccounts = total > 0
  const uptime = running ? uptimeText(status?.startedAt) : null

  const title = hasAccounts
    ? strings.overview.accountsAvailable(available)
    : strings.overview.noAccountsTitle
  const hint = !status
    ? strings.common.loading
    : !running
      ? (status.lastError ?? strings.overview.stoppedHint)
      : hasAccounts
        ? strings.overview.readyHint
        : strings.overview.emptyHint

  return (
    <div className="relative flex flex-col justify-center overflow-hidden rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-24 size-[320px] rounded-full bg-[radial-gradient(circle_at_30%_20%,var(--orb-start),var(--orb-end))] opacity-[0.1] blur-3xl"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-6 lg:flex-nowrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                !status ? "bg-faint" : running ? "bg-success" : "bg-danger",
              )}
            />
            <span>{running ? strings.status.running : strings.status.stopped}</span>
            {status ? (
              <span className="num">
                {status.host}:{status.port}
              </span>
            ) : null}
            {uptime ? <span>· {strings.overview.orbUptime(uptime)}</span> : null}
          </div>

          <h2 className="mt-3 font-serif text-[28px] leading-tight font-semibold tracking-[-0.02em]">
            {title}
            {hasAccounts && available < total ? (
              <span className="num ml-2 font-sans text-[13px] font-normal tracking-normal text-muted-foreground">
                {strings.overview.accountsTotal(total)}
              </span>
            ) : null}
          </h2>
          <p
            className={cn(
              "mt-2 max-w-[460px] text-[12.5px] leading-5",
              status && !running ? "text-text-danger" : "text-muted-foreground",
            )}
          >
            {hint}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button nativeButton={false} render={<Link to="/accounts" />}>
              {hasAccounts ? strings.overview.manageAccounts : strings.overview.addFirstAccount}
            </Button>
            <Button nativeButton={false} variant="secondary" render={<Link to="/connect" />}>
              {strings.overview.clientConnect}
            </Button>
          </div>
        </div>

        <StatusOrb running={running} />
      </div>
    </div>
  )
}
