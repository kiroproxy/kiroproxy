import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangleIcon, DownloadCloudIcon, RotateCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage, ipc } from "@/lib/ipc"
import { strings } from "@/lib/strings"
import {
  closeUpdateDialog,
  formatBytes,
  useUpdateDialogOpen,
  useUpdateStatus,
} from "@/lib/update-status"

function Notes({ notes }: { notes?: string | null }) {
  if (!notes) return <p className="text-[12px] text-muted-foreground">{strings.update.noNotes}</p>
  return (
    <pre className="max-h-[220px] overflow-y-auto rounded-[10px] bg-subtle p-3 font-mono text-[11.5px] leading-5 whitespace-pre-wrap">
      {notes}
    </pre>
  )
}

/** 全局更新对话框：查看进度与更新说明，确认后才会安装并重启。 */
export function UpdateDialog() {
  const open = useUpdateDialogOpen()
  const status = useUpdateStatus()
  const [installing, setInstalling] = useState(false)
  const latest = status.latestVersion ? `v${status.latestVersion}` : "—"

  const install = async () => {
    setInstalling(true)
    try {
      await ipc.installUpdate()
    } catch (error) {
      setInstalling(false)
      toast.error(errorMessage(error))
    }
  }

  const check = async () => {
    try {
      await ipc.checkForUpdate()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeUpdateDialog())}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{strings.update.title}</DialogTitle>
          <DialogDescription>
            {strings.update.current} v{status.currentVersion || "—"} · {strings.update.latest} {latest}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {status.installBlocked ? (
            <div className="flex gap-2 rounded-[10px] bg-warning-soft p-3 text-[12px] text-text-warning">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">{strings.update.blocked}</p>
                <p className="mt-0.5 leading-5">{status.installBlocked}</p>
                <p className="mt-1 leading-5 text-muted-foreground">{strings.update.blockedHint}</p>
              </div>
            </div>
          ) : null}

          {status.phase === "checking" ? (
            <p className="text-[12.5px] text-muted-foreground">{strings.update.checking}</p>
          ) : null}

          {status.phase === "downloading" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span>{strings.update.downloading(Math.round(status.progress ?? 0))}</span>
                <span className="num text-muted-foreground">
                  {strings.update.downloadedOf(
                    formatBytes(status.downloadedBytes),
                    status.totalBytes ? formatBytes(status.totalBytes) : "—",
                  )}
                </span>
              </div>
              <Progress value={status.progress ?? 0} aria-label={strings.update.status} />
            </div>
          ) : null}

          {status.phase === "ready" || status.phase === "installing" || installing ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-[12.5px] font-medium">
                <DownloadCloudIcon className="size-4 text-text-success" aria-hidden="true" />
                {status.latestVersion
                  ? strings.update.ready(status.latestVersion)
                  : strings.update.ready("—")}
              </p>
              <p className="text-[12px] leading-5 text-muted-foreground">
                {strings.update.restartWarning}
              </p>
            </div>
          ) : null}

          {status.phase === "installing" ? (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <RotateCwIcon className="size-3.5 animate-spin" aria-hidden="true" />
              {strings.update.installing}
            </div>
          ) : null}

          {status.phase === "failed" && status.error ? (
            <p className="rounded-[10px] bg-danger-soft p-3 text-[12px] leading-5 text-text-danger">
              {status.error}
            </p>
          ) : null}

          {status.phase === "idle" ? (
            <p className="text-[12.5px] text-muted-foreground">
              {status.lastCheckedAt ? strings.update.idle : strings.update.notChecked}
            </p>
          ) : null}

          {status.phase === "ready" ||
          status.phase === "downloading" ||
          status.phase === "installing" ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">
                {strings.update.notes}
              </span>
              {status.phase === "downloading" ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <Notes notes={status.notes} />
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => void ipc.openUpdatePage()}>
            {strings.update.openReleases}
          </Button>
          {status.phase === "ready" || installing ? (
            <Button
              onClick={() => void install()}
              disabled={installing || status.phase === "installing" || !!status.installBlocked}
            >
              <RotateCwIcon className={installing ? "animate-spin" : undefined} />
              {strings.update.restartNow}
            </Button>
          ) : (
            <Button
              onClick={() => void check()}
              disabled={status.phase === "checking" || status.phase === "downloading"}
            >
              {strings.update.check}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
