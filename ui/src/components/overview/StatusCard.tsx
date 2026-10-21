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
  const running = status.running && !status.lastError
  const hasAccounts = available > 0

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-28 size-[320px] rounded-full bg-[radial-gradient(circle_at_30%_20%,var(--orb-start),var(--orb-end))] opacity-[0.13] blur-3xl"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span className={cn("size-2 rounded-full", running ? "bg-success" : "bg-danger")} />
            <span>{running ? strings.status.running : strings.status.stopped}</span>
            <span className="num text-faint">
              {status.host}:{status.port}
            </span>
          </div>

          <h2 className="mt-3 font-serif text-[28px] leading-tight font-semibold tracking-[-0.02em]">
            {hasAccounts ? `${available} 个账号可用` : "还没有账号"}
          </h2>
          <p className="mt-2 max-w-[460px] text-[12.5px] leading-5 text-muted-foreground">
            {hasAccounts
              ? "多账号自动故障转移已就绪。Claude Code、Codex CLI 和 OpenAI SDK 都可以通过本机端口接入。"
              : "从 KAM 导入或手动添加 refreshToken，即可让 Claude Code 使用 Kiro 额度。"}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button nativeButton={false} render={<Link to="/accounts" />}>
              {hasAccounts ? strings.overview.manageAccounts : "添加第一个账号"}
            </Button>
            <Button nativeButton={false} variant="secondary" render={<Link to="/connect" />}>
              {strings.overview.clientConnect}
            </Button>
          </div>
        </div>

        <div
          className="relative flex size-[132px] shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_20%,var(--orb-start),var(--orb-end))] text-white shadow-[0_14px_34px_var(--orb-glow)]"
          aria-hidden="true"
        >
          <div className="text-center">
            <div className="num text-[36px] font-bold leading-none">{available}</div>
            <div className="mt-1 text-[11px] text-white/80">可用账号</div>
          </div>
        </div>
      </div>
    </div>
  )
}
