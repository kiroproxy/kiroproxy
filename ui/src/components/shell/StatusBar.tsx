import { cn } from "@/lib/utils"
import { strings } from "@/lib/strings"
import type { ServerStatus } from "@/lib/types"

export interface StatusBarProps {
  status: ServerStatus
  currentAccount: string
  rpm: number
  version: string
}

export function StatusBar({ status, currentAccount, rpm, version }: StatusBarProps) {
  const healthy = status.running && !status.lastError
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-panel px-4 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn("size-1.5 shrink-0 rounded-full", healthy ? "bg-success" : "bg-danger")}
        />
        <span className="truncate" title={status.lastError ?? undefined}>
          {status.running ? strings.status.running : strings.status.stopped}
        </span>
        <span className="num shrink-0 text-faint">
          {status.host}:{status.port}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="truncate">
          {strings.status.current} · {currentAccount}
        </span>
        <span className="num">
          {strings.shell.rpm} {rpm}
        </span>
        <span className="num text-faint">{strings.app.version(version)}</span>
      </div>
    </footer>
  )
}
