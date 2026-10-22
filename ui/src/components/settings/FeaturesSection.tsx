import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ipc } from "@/lib/ipc"
import { strings } from "@/lib/strings"
import type { ApplyResult, SettingsView } from "@/lib/types"
import { useUnsavedChanges } from "@/lib/unsaved-changes"
import { SettingRow, SettingsCard, SwitchRow } from "./parts"
import { isNonNegativeInteger, useApplySetting } from "./hooks"

export function FeaturesSection({ data }: { data: SettingsView }) {
  const apply = useApplySetting()
  const [chunking, setChunking] = useState(String(data.writeChunkingMaxLines))
  const chunkingError = isNonNegativeInteger(chunking) ? null : strings.settings.invalidNumber
  const chunkingDirty = Number(chunking) !== data.writeChunkingMaxLines
  useUnsavedChanges("settings:features", chunkingDirty)

  const toggle = (fn: (next: boolean) => Promise<ApplyResult>) => (next: boolean) =>
    void apply.run(() => fn(next))

  return (
    <SettingsCard>
      <SwitchRow
        label={strings.settings.suggestionMode}
        desc={strings.settings.suggestionModeHint}
        checked={data.forwardSuggestionMode}
        onChange={toggle(ipc.setSuggestionMode)}
      />
      <SwitchRow
        label={strings.settings.clientTokenPassthrough}
        desc={strings.settings.clientTokenPassthroughHint}
        checked={data.clientTokenPassthrough}
        onChange={toggle(ipc.setClientTokenPassthrough)}
      />
      <SwitchRow
        label={strings.settings.thinkingAsText}
        desc={strings.settings.thinkingAsTextHint}
        checked={data.thinkingAsText}
        onChange={toggle(ipc.setThinkingAsText)}
      />
      <SwitchRow
        label={strings.settings.outputTokensIncludeThinking}
        desc={strings.settings.outputTokensIncludeThinkingHint}
        checked={data.outputTokensIncludeThinking}
        onChange={toggle(ipc.setOutputTokensIncludeThinking)}
      />
      <SwitchRow
        label={strings.settings.modelsOfficialAliases}
        desc={strings.settings.modelsOfficialAliasesHint}
        checked={data.modelsOfficialAliases}
        onChange={toggle(ipc.setModelsOfficialAliases)}
      />
      <SwitchRow
        label={strings.settings.promptCacheAccounting}
        desc={strings.settings.promptCacheAccountingHint}
        restart
        checked={data.promptCacheAccounting}
        onChange={toggle(ipc.setPromptCacheAccounting)}
      />
      <SettingRow
        label={strings.settings.writeChunkingMaxLines}
        desc={strings.settings.writeChunkingHint}
        htmlFor="settings-chunking"
        error={chunkingError}
      >
        <Input
          id="settings-chunking"
          className="w-[120px]"
          inputMode="numeric"
          value={chunking}
          aria-invalid={!!chunkingError}
          onChange={(event) => setChunking(event.target.value)}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!chunkingDirty || !!chunkingError || apply.busy}
          onClick={() => void apply.run(() => ipc.setWriteChunkingMaxLines(Number(chunking)))}
        >
          {strings.common.save}
        </Button>
      </SettingRow>
      <SwitchRow
        label={strings.settings.debugLogs}
        desc={strings.settings.debugLogsHint}
        checked={data.debugLogs}
        onChange={toggle(ipc.setDebugLogs)}
      />
      <SwitchRow
        label={strings.settings.dumpKiroBody}
        desc={strings.settings.dumpKiroBodyHint}
        checked={data.dumpKiroBody}
        onChange={toggle(ipc.setDumpKiroBody)}
      />
    </SettingsCard>
  )
}
