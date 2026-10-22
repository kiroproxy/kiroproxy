import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { errorMessage, ipc } from "@/lib/ipc"
import { strings } from "@/lib/strings"
import {
  formatBytes,
  openUpdateDialog,
  useUpdateStatus,
} from "@/lib/update-status"
import { toast } from "sonner"
import { SettingRow, SettingsCard } from "./parts"

function statusText(
  phase: ReturnType<typeof useUpdateStatus>["phase"],
  latest?: string | null,
  percent?: number | null,
): string {
  switch (phase) {
    case "checking":
      return strings.update.checking
    case "downloading":
      return strings.update.downloading(Math.round(percent ?? 0))
    case "ready":
      return latest ? strings.update.ready(latest) : strings.update.ready("—")
    case "installing":
      return strings.update.installing
    case "failed":
      return strings.update.failed
    case "idle":
    default:
      return strings.update.idle
  }
}

/** 设置 → 关于 里的「软件更新」卡片。 */
export function UpdateCard() {
  const status = useUpdateStatus()
  const latest = status.latestVersion ? `v${status.latestVersion}` : "—"

  const check = async () => {
    try {
      await ipc.checkForUpdate()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <SettingsCard>
      <SettingRow label={strings.update.current}>
        <code className="font-mono text-[12px]">v{status.currentVersion || "—"}</code>
      </SettingRow>
      <SettingRow
        label={strings.update.status}
        desc={status.phase === "failed" && status.error ? status.error : strings.update.autoHint}
      >
        {status.phase === "downloading" ? (
          <div className="flex w-[220px] flex-col gap-1">
            <span className="num text-right text-[11.5px] text-muted-foreground">
              {strings.update.downloadedOf(
                formatBytes(status.downloadedBytes),
                status.totalBytes ? formatBytes(status.totalBytes) : "—",
              )}
            </span>
            <Progress value={status.progress ?? 0} aria-label={strings.update.status} />
          </div>
        ) : (
          <Badge
            variant={
              status.phase === "ready"
                ? "success"
                : status.phase === "failed"
                  ? "danger"
                  : "neutral"
            }
          >
            {statusText(status.phase, status.latestVersion, status.progress)}
          </Badge>
        )}
      </SettingRow>
      {status.installBlocked ? (
        <SettingRow label={strings.update.blocked} desc={status.installBlocked}>
          <Button variant="secondary" size="sm" onClick={() => void ipc.openUpdatePage()}>
            {strings.update.openReleases}
          </Button>
        </SettingRow>
      ) : (
        <SettingRow label={strings.update.latest}>
          <code className="font-mono text-[12px]">{latest}</code>
          {status.phase === "ready" ? (
            <Button onClick={openUpdateDialog}>{strings.update.restartNow}</Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void check()}
              disabled={status.phase === "checking" || status.phase === "downloading"}
            >
              {strings.update.check}
            </Button>
          )}
        </SettingRow>
      )}
    </SettingsCard>
  )
}
