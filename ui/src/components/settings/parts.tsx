import type { ReactNode } from "react"
import { RotateCwIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useSaveStatus } from "@/lib/save-status"
import { strings } from "@/lib/strings"
import { useRestartAction } from "./hooks"

const FIELD_LABELS: Record<string, string> = {
  host: strings.settings.host,
  port: strings.settings.port,
  proxyUrl: strings.settings.proxyUrl,
  proxyUsername: strings.settings.proxyUsername,
  proxyPassword: strings.settings.proxyPassword,
  tlsBackend: strings.settings.tlsBackend,
  region: strings.settings.region,
  authRegion: strings.accounts.authRegion,
  apiRegion: strings.accounts.apiRegion,
  promptCacheAccounting: strings.settings.promptCacheAccounting,
}

export function SettingsCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-3 border-t border-border bg-subtle/40 px-4 py-3">
          {footer}
        </div>
      ) : null}
    </Card>
  )
}

export function SettingRow({
  label,
  desc,
  restart,
  htmlFor,
  error,
  children,
}: {
  label: string
  desc?: ReactNode
  restart?: boolean
  htmlFor?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="text-[12.5px] font-semibold">
              {label}
            </label>
          ) : (
            <span className="text-[12.5px] font-semibold">{label}</span>
          )}
          {restart ? (
            <Badge variant="warning" className="h-[18px] px-1.5 text-[11px]">
              {strings.settings.restartBadge}
            </Badge>
          ) : null}
        </div>
        {desc ? <div className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">{desc}</div> : null}
        {error ? (
          <p role="alert" className="mt-1 text-[11.5px] text-text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function SwitchRow({
  label,
  desc,
  restart,
  checked,
  onChange,
  disabled,
}: {
  label: string
  desc?: string
  restart?: boolean
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <SettingRow label={label} desc={desc} restart={restart}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </SettingRow>
  )
}

/** 有字段需要重启才能生效时，在设置列顶部提示并给出「应用并重启代理」。 */
export function RestartBanner() {
  const save = useSaveStatus()
  const restart = useRestartAction()
  if (save.kind !== "restart") return null
  const fields = (save.fields ?? []).map((field) => FIELD_LABELS[field] ?? field).join("、")
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-[16px] border border-warning/40 bg-warning-soft px-4 py-3 text-[12.5px] text-text-warning"
    >
      <RotateCwIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{strings.settings.saveStatusRestartHint(fields)}</span>
      <Button size="sm" onClick={restart.run} disabled={restart.pending}>
        {restart.pending ? strings.settings.restarting : strings.settings.applyAndRestart}
      </Button>
    </div>
  )
}
