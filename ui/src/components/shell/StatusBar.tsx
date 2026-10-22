import { useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import { strings } from "@/lib/strings"
import { useSaveStatus } from "@/lib/save-status"
import { serverDotClass, serverState, type ShellStatus } from "./use-shell-status"
import { openUpdateDialog, useUpdateStatus } from "@/lib/update-status"

function serverLabel(status: ShellStatus["server"]): string {
  if (!status) return strings.common.loading
  return status.running ? strings.status.running : strings.status.stopped
}

function SaveState() {
  const save = useSaveStatus()
  const time = save.at
    ? new Date(save.at).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })
    : ""
  if (save.kind === "restart") {
    return (
      <span className="flex items-center gap-2 text-text-warning">
        <span className="size-1.5 shrink-0 rounded-full bg-warning" />
        {strings.settings.saveStatusRestart}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-2">
      <span className="size-1.5 shrink-0 rounded-full bg-success" />
      {save.kind === "saved" ? strings.settings.savedAt(time) : strings.settings.saveStatusApplied}
    </span>
  )
}

export function StatusBar({ status }: { status: ShellStatus }) {
  const { pathname } = useLocation()
  const settingsMode = pathname.startsWith("/settings")
  const state = serverState(status.server)
  const update = useUpdateStatus()
  const updateReady = update.phase === "ready" && update.latestVersion

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-border bg-panel px-4 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        {settingsMode ? (
          <SaveState />
        ) : (
          <>
            <span className={cn("size-1.5 shrink-0 rounded-full", serverDotClass[state])} />
            <span className="truncate" title={status.server?.lastError ?? undefined}>
              {serverLabel(status.server)}
            </span>
            {status.server ? (
              <span className="num shrink-0">
                {status.server.host}:{status.server.port}
              </span>
            ) : null}
          </>
        )}
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        {settingsMode ? null : (
          <>
            <span className="max-w-[240px] truncate">
              {strings.status.current} · {status.currentAccount}
            </span>
            <span className="num">
              {strings.shell.rpm} {status.rpm}
            </span>
          </>
        )}
        {updateReady ? (
          <button
            type="button"
            className="num font-medium text-text-warning hover:underline"
            onClick={openUpdateDialog}
          >
            {strings.update.readyShort(update.latestVersion ?? "")}
          </button>
        ) : status.version ? (
          <span className="num">{strings.app.version(status.version)}</span>
        ) : null}
      </div>
    </footer>
  )
}
