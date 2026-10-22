import { useState } from "react"
import { FolderOpenIcon } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { errorMessage, ipc } from "@/lib/ipc"
import { strings } from "@/lib/strings"
import type { SettingsView } from "@/lib/types"
import { SettingRow, SettingsCard } from "./parts"

function PathValue({ path }: { path: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <code className="block max-w-[340px] truncate font-mono text-[11.5px] text-muted-foreground" />
        }
      >
        {path}
      </TooltipTrigger>
      <TooltipContent className="max-w-[520px] break-all font-mono text-[11px]">{path}</TooltipContent>
    </Tooltip>
  )
}

const run = (fn: () => Promise<unknown>) => () => {
  fn().catch((error: unknown) => toast.error(errorMessage(error)))
}

export function DataSection({ data }: { data: SettingsView }) {
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const clearLogs = async () => {
    setClearing(true)
    try {
      await ipc.clearLogs()
      toast.success(strings.logs.cleared)
      setClearOpen(false)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setClearing(false)
    }
  }

  return (
    <>
      <SettingsCard>
        <SettingRow label={strings.settings.dataDir} desc={<PathValue path={data.dataDir} />}>
          <Button variant="secondary" size="sm" onClick={run(ipc.openDataDir)}>
            <FolderOpenIcon />
            {strings.settings.openDataDir}
          </Button>
        </SettingRow>
        <SettingRow label={strings.settings.configPath} desc={<PathValue path={data.configPath} />}>
          <Button variant="secondary" size="sm" onClick={run(() => ipc.openFile("config"))}>
            {strings.settings.openConfig}
          </Button>
        </SettingRow>
        <SettingRow label={strings.settings.credentialsPath} desc={<PathValue path={data.credentialsPath} />}>
          <span />
        </SettingRow>
        <SettingRow label={strings.logs.runtime}>
          <Button variant="secondary" size="sm" onClick={run(() => ipc.openFile("log"))}>
            {strings.settings.openLog}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setClearOpen(true)}>
            {strings.settings.clearLogs}
          </Button>
        </SettingRow>
      </SettingsCard>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.logs.clearTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.settings.clearLogsConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.common.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="danger" disabled={clearing} onClick={() => void clearLogs()}>
              {strings.common.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
