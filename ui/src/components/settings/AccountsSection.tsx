import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { ipc } from "@/lib/ipc"
import { strings } from "@/lib/strings"
import type { SettingsView } from "@/lib/types"
import { useUnsavedChanges } from "@/lib/unsaved-changes"
import { SettingRow, SettingsCard } from "./parts"
import { isNonNegativeInteger, useApplySetting } from "./hooks"

export function AccountsSection({ data }: { data: SettingsView }) {
  const apply = useApplySetting()
  const [maxRpm, setMaxRpm] = useState(String(data.maxRpmPerCredential))
  const rpmError = isNonNegativeInteger(maxRpm) ? null : strings.settings.invalidNumber
  const rpmDirty = Number(maxRpm) !== data.maxRpmPerCredential
  useUnsavedChanges("settings:accounts", rpmDirty)

  return (
    <SettingsCard>
      <SettingRow label={strings.settings.loadBalancing} desc={strings.settings.loadBalancingHint}>
        <Select
          value={data.loadBalancingMode}
          onValueChange={(mode) =>
            void apply.run(() => ipc.setLoadBalancingMode(String(mode) as "priority" | "balanced"))
          }
        >
          <SelectTrigger className="w-[200px]" aria-label={strings.settings.loadBalancing}>
            <span>
              {data.loadBalancingMode === "priority"
                ? strings.settings.loadBalancingPriority
                : strings.settings.loadBalancingBalanced}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">{strings.settings.loadBalancingPriority}</SelectItem>
            <SelectItem value="balanced">{strings.settings.loadBalancingBalanced}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        label={strings.settings.maxRpm}
        desc={strings.settings.maxRpmHint}
        htmlFor="settings-max-rpm"
        error={rpmError}
      >
        <Input
          id="settings-max-rpm"
          className="w-[120px]"
          inputMode="numeric"
          value={maxRpm}
          aria-invalid={!!rpmError}
          onChange={(event) => setMaxRpm(event.target.value)}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!rpmDirty || !!rpmError || apply.busy}
          onClick={() => void apply.run(() => ipc.setMaxRpmPerCredential(Number(maxRpm)))}
        >
          {strings.common.save}
        </Button>
      </SettingRow>
    </SettingsCard>
  )
}
