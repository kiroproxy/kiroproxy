import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"
import type { ServerStatus } from "@/lib/types"

export interface StatusCardProps {
  status: ServerStatus
  available: number
}

export function StatusCard({ status, available }: StatusCardProps) {
  return (
    <div className="relative flex min-h-[136px] items-center justify-between gap-6 overflow-hidden rounded-[22px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -left-16 size-64 rounded-full bg-[radial-gradient(circle_at_30%_20%,var(--primary-hover),var(--primary-active))] opacity-20 blur-2xl"
      />
      <div className="relative min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn("size-2 shrink-0 rounded-full", status.running ? "bg-success" : "bg-danger")}
          />
          <h2 className="font-serif text-[22px] leading-tight font-semibold">
            {status.running ? strings.status.running : strings.status.stopped}
          </h2>
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          {status.running
            ? strings.overview.statusRunning(available)
            : strings.overview.statusStopped}
          <span className="num ml-2 text-faint">
            {status.host}:{status.port}
          </span>
        </p>
      </div>
      <div className="relative flex shrink-0 items-center gap-2">
        <Button nativeButton={false} render={<Link to="/accounts" />}>
          {strings.overview.manageAccounts}
        </Button>
        <Button nativeButton={false} variant="secondary" render={<Link to="/connect" />}>
          {strings.overview.clientConnect}
        </Button>
      </div>
    </div>
  )
}
