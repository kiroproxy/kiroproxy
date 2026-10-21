import { useEffect, useState } from "react"
import { ipc } from "@/lib/ipc"
import { strings } from "@/lib/strings"
import type { ServerStatus } from "@/lib/types"

export interface ShellStatus {
  server: ServerStatus
  currentAccount: string
  rpm: number
  version: string
}

const DEFAULT_SERVER_STATUS: ServerStatus = {
  running: true,
  host: "127.0.0.1",
  port: 5678,
  baseUrl: "http://127.0.0.1:5678",
}

const DEFAULT_STATUS: ShellStatus = {
  server: DEFAULT_SERVER_STATUS,
  currentAccount: strings.status.noAccount,
  rpm: 0,
  version: "0.1.0",
}

function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function accountLabel(accounts: Awaited<ReturnType<typeof ipc.listAccounts>>): string {
  const current = accounts.credentials.find((item) => item.id === accounts.currentId)
  if (!current) return strings.status.noAccount
  return current.nickname ?? current.email ?? `#${current.id}`
}

export function useShellStatus(): ShellStatus {
  const [status, setStatus] = useState<ShellStatus>(DEFAULT_STATUS)

  useEffect(() => {
    if (!hasTauri()) return
    let active = true

    const refresh = async () => {
      const [server, accounts, rpm, appInfo] = await Promise.allSettled([
        ipc.getServerStatus(),
        ipc.listAccounts(),
        ipc.getRpm(),
        ipc.getAppInfo(),
      ])
      if (!active) return
      setStatus((previous) => ({
        server: server.status === "fulfilled" ? server.value : previous.server,
        currentAccount:
          accounts.status === "fulfilled" ? accountLabel(accounts.value) : previous.currentAccount,
        rpm: rpm.status === "fulfilled" ? rpm.value.global : previous.rpm,
        version: appInfo.status === "fulfilled" ? appInfo.value.version : previous.version,
      }))
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  return status
}
