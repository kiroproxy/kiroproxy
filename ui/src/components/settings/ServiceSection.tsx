import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ipc } from "@/lib/ipc"
import { useServerStatus, useUpdateRuntimeConfig } from "@/lib/queries"
import { markSaved } from "@/lib/save-status"
import { strings } from "@/lib/strings"
import type { SettingsView } from "@/lib/types"
import { serverState, type ServerState } from "@/components/shell/use-shell-status"
import { useRestartAction } from "./hooks"
import { SettingRow, SettingsCard } from "./parts"

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"])

/** 重启失败时旧服务仍在运行（degraded），显示「运行中」并用警告色，原因写在说明里。 */
const STATE_BADGE: Record<ServerState, "neutral" | "success" | "warning" | "danger"> = {
  loading: "neutral",
  running: "success",
  degraded: "warning",
  stopped: "danger",
}

export function ServiceSection({ data }: { data: SettingsView }) {
  const server = useServerStatus()
  const update = useUpdateRuntimeConfig()
  const restart = useRestartAction()
  const [host, setHost] = useState(data.host)
  const [port, setPort] = useState(String(data.port))
  const [confirmHost, setConfirmHost] = useState(false)

  const portNumber = Number(port)
  const portError =
    port.trim() && (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535)
      ? strings.settings.invalidPort
      : null
  const hostError = host.trim() ? null : strings.settings.invalidHost
  const dirty = host.trim() !== data.host || portNumber !== data.port
  const state = serverState(server.data)

  const save = () => {
    update.mutate(
      { host: host.trim(), port: portNumber },
      {
        onSuccess: (result) => {
          markSaved(result.restartRequired)
          toast.success(strings.settings.saveStatusRestart)
        },
      },
    )
  }

  const requestSave = () => {
    if (portError || hostError || !dirty) return
    if (!LOOPBACK.has(host.trim())) setConfirmHost(true)
    else save()
  }

  return (
    <>
      <SettingsCard
        footer={
          <>
            {dirty ? (
              <span className="mr-auto text-[11.5px] text-muted-foreground">{strings.settings.restartFooter}</span>
            ) : null}
            <Button onClick={requestSave} disabled={!dirty || !!portError || !!hostError || update.isPending}>
              {strings.common.save}
            </Button>
          </>
        }
      >
        <SettingRow label={strings.settings.host} restart htmlFor="settings-host" error={hostError}>
          <Input
            id="settings-host"
            className="w-[200px]"
            value={host}
            aria-invalid={!!hostError}
            onChange={(event) => setHost(event.target.value)}
          />
        </SettingRow>
        <SettingRow label={strings.settings.port} restart htmlFor="settings-port" error={portError}>
          <Input
            id="settings-port"
            className="w-[200px]"
            inputMode="numeric"
            value={port}
            aria-invalid={!!portError}
            onChange={(event) => setPort(event.target.value)}
          />
        </SettingRow>
        <SettingRow label={strings.settings.baseUrl}>
          <code className="rounded-[6px] bg-subtle px-2 py-1 font-mono text-[11.5px]">
            http://{data.host}:{data.port}
          </code>
          <Button variant="secondary" size="sm" onClick={() => void ipc.openFile("config")}>
            {strings.settings.openConfig}
          </Button>
        </SettingRow>
        <SettingRow
          label={strings.settings.serverStatus}
          desc={server.data?.lastError ?? undefined}
        >
          <Badge variant={STATE_BADGE[state]}>
            {state === "loading"
              ? strings.common.loading
              : state === "stopped"
                ? strings.status.stopped
                : strings.status.running}
          </Badge>
          <Button variant="secondary" size="sm" onClick={restart.run} disabled={restart.pending}>
            {restart.pending ? strings.settings.restarting : strings.common.restart}
          </Button>
        </SettingRow>
      </SettingsCard>

      <AlertDialog open={confirmHost} onOpenChange={setConfirmHost}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.settings.hostWarningTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.settings.hostWarning(host.trim())}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                setConfirmHost(false)
                save()
              }}
            >
              {strings.settings.hostWarningConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
