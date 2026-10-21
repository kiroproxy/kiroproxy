import { useState, type ReactNode } from "react"
import { useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { SegmentedNav } from "@/components/shell/TopBar"
import { ipc } from "@/lib/ipc"
import { queryKeys, useAccounts, useSettings } from "@/lib/queries"
import { strings } from "@/lib/strings"
import { useTheme, type Theme } from "@/lib/theme"
import type { ApplyResult, RuntimeConfigPatch } from "@/lib/types"

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden">
      <div className="border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[.08em] text-faint">
        {title}
      </div>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold">{label}</div>
        {desc ? (
          <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{desc}</div>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function SwitchRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <Row label={label} desc={desc}>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Row>
  )
}

const themeOptions: { value: Theme; label: string }[] = [
  { value: "system", label: strings.settings.themeSystem },
  { value: "light", label: strings.settings.themeLight },
  { value: "dark", label: strings.settings.themeDark },
]

export function SettingsPage() {
  const { section = "general" } = useParams<{ section: string }>()
  const settings = useSettings()
  const accounts = useAccounts()
  const queryClient = useQueryClient()
  const { theme, setTheme } = useTheme()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [restartRequired, setRestartRequired] = useState<string[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const data = settings.data

  const markSaved = () => setSavedAt(Date.now())
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings })
    await queryClient.invalidateQueries({ queryKey: queryKeys.server })
    markSaved()
  }

  const apply = async (patch: RuntimeConfigPatch) => {
    setBusy(true)
    try {
      const result: ApplyResult = await ipc.setRuntimeConfig(patch)
      setRestartRequired(result.restartRequired)
      await invalidate()
      toast.success(
        result.restartRequired.length > 0
          ? strings.settings.saveStatusRestart
          : strings.settings.saveStatusSaved,
      )
    } catch (error) {
      toast.error((error as { message?: string }).message ?? strings.errors.actionFailed)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (fn: () => Promise<ApplyResult>, label: string) => {
    try {
      await fn()
      await invalidate()
      toast.success(`${label}${strings.settings.saveStatusSaved}`)
    } catch (error) {
      toast.error((error as { message?: string }).message ?? strings.errors.actionFailed)
    }
  }

  const restart = async () => {
    setBusy(true)
    try {
      await ipc.restartProxyServer()
      setRestartRequired([])
      await invalidate()
      toast.success(strings.settings.saveStatusSaved)
    } catch (error) {
      toast.error((error as { message?: string }).message ?? strings.errors.actionFailed)
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <section className="mx-auto w-full max-w-[760px]">
        <div className="rounded-[16px] border border-border bg-card p-10 text-center text-muted-foreground">
          {settings.isLoading ? strings.common.loading : strings.errors.loadFailed}
        </div>
      </section>
    )
  }

  const value = (key: string, fallback = "") => form[key] ?? fallback

  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-success" />
        {savedAt ? strings.settings.saveStatusSaved : strings.settings.saveStatusApplied}
        {restartRequired.length > 0 ? (
          <span className="ml-auto flex items-center gap-2 text-text-warning">
            {strings.settings.saveStatusRestart}
            <Button variant="secondary" size="sm" onClick={restart} disabled={busy}>
              {strings.settings.applyAndRestart}
            </Button>
          </span>
        ) : null}
      </div>

      {section === "general" ? (
        <Section title={strings.settings.sections.general}>
          <Row label={strings.settings.language}>
            <span className="text-[12.5px] text-muted-foreground">
              {strings.settings.languageValue}
            </span>
          </Row>
          <Row label={strings.settings.theme}>
            <SegmentedNav
              items={themeOptions}
              value={theme}
              onChange={(next) => setTheme(next as Theme)}
              ariaLabel={strings.settings.theme}
            />
          </Row>
          <Row label={strings.settings.reduceMotion} desc={strings.settings.reduceMotionHint}>
            <Badge variant="neutral">跟随系统</Badge>
          </Row>
        </Section>
      ) : null}

      {section === "appearance" ? (
        <Section title={strings.settings.sections.appearance}>
          <Row label={strings.settings.theme}>
            <SegmentedNav
              items={themeOptions}
              value={theme}
              onChange={(next) => setTheme(next as Theme)}
              ariaLabel={strings.settings.theme}
            />
          </Row>
          <Row label={strings.settings.reduceMotion} desc={strings.settings.reduceMotionHint}>
            <Badge variant="neutral">跟随系统</Badge>
          </Row>
        </Section>
      ) : null}

      {section === "service" ? (
        <Section title={strings.settings.sections.service}>
          <Row label={strings.settings.host}>
            <Input
              className="w-[180px]"
              value={value("host", data.host)}
              onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))}
            />
          </Row>
          <Row label={strings.settings.port}>
            <Input
              className="w-[110px]"
              type="number"
              value={value("port", String(data.port))}
              onChange={(event) => setForm((prev) => ({ ...prev, port: event.target.value }))}
            />
          </Row>
          <Row label={strings.settings.baseUrl}>
            <code className="rounded-[6px] bg-subtle px-2 py-1 font-mono text-[11.5px]">
              http://{data.host}:{data.port}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void ipc.openFile("config")}>
              {strings.settings.openConfig}
            </Button>
          </Row>
          <Row label={strings.settings.serverStatus}>
            <Badge variant="success">{strings.status.running}</Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void ipc.restartProxyServer().then(invalidate)}
            >
              {strings.common.restart}
            </Button>
          </Row>
          <div className="flex justify-end px-4 py-3">
            <Button
              onClick={() =>
                void apply({
                  host: value("host", data.host),
                  port: Number(value("port", String(data.port))) || data.port,
                })
              }
              disabled={busy}
            >
              {strings.common.save}
            </Button>
          </div>
        </Section>
      ) : null}

      {section === "accounts" ? (
        <Section title={strings.settings.sections.accounts}>
          <Row label={strings.settings.loadBalancing}>
            <Select
              value={data.loadBalancingMode}
              onValueChange={(mode) =>
                void toggle(
                  () => ipc.setLoadBalancingMode(String(mode) as "priority" | "balanced"),
                  strings.settings.loadBalancing,
                )
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">{strings.settings.loadBalancingPriority}</SelectItem>
                <SelectItem value="balanced">{strings.settings.loadBalancingBalanced}</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label={strings.settings.maxRpm} desc={strings.settings.maxRpmHint}>
            <Input
              className="w-[110px]"
              type="number"
              min={0}
              value={value("maxRpm", String(data.maxRpmPerCredential))}
              onChange={(event) => setForm((prev) => ({ ...prev, maxRpm: event.target.value }))}
            />
          </Row>
          <div className="flex justify-end px-4 py-3">
            <Button
              onClick={() =>
                void toggle(
                  () =>
                    ipc.setMaxRpmPerCredential(
                      Number(value("maxRpm", String(data.maxRpmPerCredential))) || 0,
                    ),
                  strings.settings.maxRpm,
                )
              }
            >
              {strings.common.save}
            </Button>
          </div>
        </Section>
      ) : null}

      {section === "network" ? (
        <Section title={strings.settings.sections.network}>
          <Row label={strings.settings.proxyUrl}>
            <Input
              className="w-[280px]"
              placeholder="http://127.0.0.1:7890"
              value={value("proxyUrl", data.proxyUrl ?? "")}
              onChange={(event) => setForm((prev) => ({ ...prev, proxyUrl: event.target.value }))}
            />
          </Row>
          <Row label={strings.settings.proxyUsername}>
            <Input
              className="w-[200px]"
              value={value("proxyUsername", "")}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, proxyUsername: event.target.value }))
              }
            />
          </Row>
          <Row label={strings.settings.proxyPassword}>
            <Input
              className="w-[200px]"
              type="password"
              placeholder={data.proxyAuthConfigured ? strings.settings.proxyPasswordSet : ""}
              value={value("proxyPassword", "")}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, proxyPassword: event.target.value }))
              }
            />
          </Row>
          <Row label={strings.settings.tlsBackend}>
            <Badge variant="neutral">{data.tlsBackend}</Badge>
          </Row>
          <Row label={strings.settings.testConnection}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const first = accounts.data?.credentials[0]
                if (!first) {
                  toast.error(strings.accounts.empty)
                  return
                }
                void ipc
                  .getAccountBalance(first.id)
                  .then(() => toast.success("连接正常"))
                  .catch((error: { message?: string }) =>
                    toast.error(error.message ?? strings.errors.actionFailed),
                  )
              }}
            >
              {strings.settings.testConnection}
            </Button>
          </Row>
          <div className="flex justify-end px-4 py-3">
            <Button
              onClick={() =>
                void apply({
                  proxyUrl: value("proxyUrl", data.proxyUrl ?? "") || null,
                  proxyUsername: value("proxyUsername", "") || null,
                  proxyPassword: value("proxyPassword", "") || null,
                })
              }
              disabled={busy}
            >
              {strings.common.save}
            </Button>
          </div>
        </Section>
      ) : null}

      {section === "features" ? (
        <Section title={strings.settings.sections.features}>
          <SwitchRow
            label={strings.settings.suggestionMode}
            checked={data.forwardSuggestionMode}
            onChange={(next) =>
              void toggle(() => ipc.setSuggestionMode(next), strings.settings.suggestionMode)
            }
          />
          <SwitchRow
            label={strings.settings.clientTokenPassthrough}
            checked={data.clientTokenPassthrough}
            onChange={(next) =>
              void toggle(
                () => ipc.setClientTokenPassthrough(next),
                strings.settings.clientTokenPassthrough,
              )
            }
          />
          <SwitchRow
            label={strings.settings.thinkingAsText}
            checked={data.thinkingAsText}
            onChange={(next) =>
              void toggle(() => ipc.setThinkingAsText(next), strings.settings.thinkingAsText)
            }
          />
          <SwitchRow
            label={strings.settings.debugLogs}
            checked={data.debugLogs}
            onChange={(next) => void toggle(() => ipc.setDebugLogs(next), strings.settings.debugLogs)}
          />
          <SwitchRow
            label={strings.settings.dumpKiroBody}
            checked={data.dumpKiroBody}
            onChange={(next) =>
              void toggle(() => ipc.setDumpKiroBody(next), strings.settings.dumpKiroBody)
            }
          />
          <Row label={strings.settings.writeChunkingMaxLines}>
            <Input
              className="w-[110px]"
              type="number"
              min={0}
              value={value("chunking", String(data.writeChunkingMaxLines))}
              onChange={(event) => setForm((prev) => ({ ...prev, chunking: event.target.value }))}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void toggle(
                  () => ipc.setWriteChunkingMaxLines(Number(value("chunking", "300")) || 0),
                  strings.settings.writeChunkingMaxLines,
                )
              }
            >
              {strings.common.save}
            </Button>
          </Row>
          <Row label={strings.settings.promptCacheAccounting}>
            <Badge variant={data.promptCacheAccounting ? "success" : "neutral"}>
              {data.promptCacheAccounting ? strings.common.enabled : strings.common.disabled}
            </Badge>
          </Row>
          <Row label={strings.settings.outputTokensIncludeThinking}>
            <Badge variant={data.outputTokensIncludeThinking ? "success" : "neutral"}>
              {data.outputTokensIncludeThinking ? strings.common.enabled : strings.common.disabled}
            </Badge>
          </Row>
          <Row label={strings.settings.modelsOfficialAliases}>
            <Badge variant={data.modelsOfficialAliases ? "success" : "neutral"}>
              {data.modelsOfficialAliases ? strings.common.enabled : strings.common.disabled}
            </Badge>
          </Row>
        </Section>
      ) : null}

      {section === "data" ? (
        <Section title={strings.settings.sections.data}>
          <Row label={strings.settings.dataDir}>
            <code className="max-w-[320px] truncate font-mono text-[11px] text-muted-foreground">
              {data.dataDir}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void ipc.openDataDir()}>
              {strings.settings.openDataDir}
            </Button>
          </Row>
          <Row label={strings.settings.configPath}>
            <code className="max-w-[320px] truncate font-mono text-[11px] text-muted-foreground">
              {data.configPath}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void ipc.openFile("config")}>
              {strings.settings.openConfig}
            </Button>
          </Row>
          <Row label={strings.settings.openLog}>
            <Button variant="secondary" size="sm" onClick={() => void ipc.openFile("log")}>
              {strings.settings.openLog}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!window.confirm(strings.logs.clearConfirm)) return
                void ipc.clearLogs().then(() => toast.success(strings.settings.saveStatusSaved))
              }}
            >
              {strings.settings.clearLogs}
            </Button>
          </Row>
        </Section>
      ) : null}

      {section === "about" ? (
        <Section title={strings.settings.sections.about}>
          <Row label={strings.settings.version}>
            <code className="font-mono text-[11.5px]">v{data.version}</code>
          </Row>
          <Row label={strings.settings.upstreamCredit}>
            <span className="text-[12px] text-muted-foreground">
              TsinHzl/kiro2cc-proxy · hank9999/kiro.rs
            </span>
          </Row>
          <Row label={strings.settings.license}>
            <span className="text-[12px] text-muted-foreground">MIT</span>
          </Row>
          <Row label={strings.settings.projectLink}>
            <span className="text-[12px] text-muted-foreground">
              github.com/pigcursor/kiroproxy
            </span>
          </Row>
        </Section>
      ) : null}
    </section>
  )
}
