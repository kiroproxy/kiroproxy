import { accountName } from "@/lib/account-status"
import { useAccounts, useAppInfo, useRpm, useServerStatus } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { ServerStatus } from "@/lib/types"

export interface ShellStatus {
  /** 尚未拿到状态时为 undefined，界面显示中性占位而不是假装运行中。 */
  server?: ServerStatus
  currentAccount: string
  rpm: number
  version?: string
}

/** 状态栏与概览共用同一组查询（同一个 query key 只会请求一次）。 */
export function useShellStatus(): ShellStatus {
  const server = useServerStatus()
  const accounts = useAccounts()
  const rpm = useRpm()
  const appInfo = useAppInfo()

  const current = accounts.data?.credentials.find((item) => item.id === accounts.data?.currentId)

  return {
    server: server.data,
    currentAccount: current ? accountName(current) : strings.status.noAccount,
    rpm: rpm.data?.global ?? 0,
    version: appInfo.data?.version,
  }
}

/**
 * 代理状态。loading：还没拿到状态，不能显示成「未运行」；degraded：仍在运行，但最近一次
 * 启动或重启出错（重启失败时旧服务继续运行，lastError 记录原因）。
 */
export type ServerState = "loading" | "running" | "degraded" | "stopped"

export function serverState(status?: ServerStatus): ServerState {
  if (!status) return "loading"
  if (!status.running) return "stopped"
  return status.lastError ? "degraded" : "running"
}

/** 各状态的指示圆点颜色。 */
export const serverDotClass: Record<ServerState, string> = {
  loading: "bg-faint",
  running: "bg-success",
  degraded: "bg-warning",
  stopped: "bg-danger",
}
