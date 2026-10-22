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

export function isHealthy(status?: ServerStatus): boolean {
  return !!status && status.running && !status.lastError
}
