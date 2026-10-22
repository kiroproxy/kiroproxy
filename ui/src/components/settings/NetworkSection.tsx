import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { errorMessage, ipc } from "@/lib/ipc"
import { useUpdateRuntimeConfig } from "@/lib/queries"
import { markSaved } from "@/lib/save-status"
import { strings } from "@/lib/strings"
import type { RuntimeConfigPatch, SettingsView, TestConnectionResult } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SettingRow, SettingsCard } from "./parts"

const PROXY_PATTERN = /^(https?|socks5h?):\/\/[^\s/]+/i
const INPUT_WIDTH = "w-[280px]"

interface NetworkForm {
  proxyUrl: string
  proxyUsername: string
  proxyPassword: string
  tlsBackend: "rustls" | "native-tls"
  region: string
  authRegion: string
  apiRegion: string
}

function fromSettings(data: SettingsView): NetworkForm {
  return {
    proxyUrl: data.proxyUrl ?? "",
    proxyUsername: "",
    proxyPassword: "",
    tlsBackend: data.tlsBackend,
    region: data.region,
    authRegion: data.authRegion ?? "",
    apiRegion: data.apiRegion ?? "",
  }
}

/** 只提交改动过的字段；用户名、密码不回显，填写才会提交。 */
function buildPatch(data: SettingsView, form: NetworkForm): RuntimeConfigPatch {
  const initial = fromSettings(data)
  const patch: RuntimeConfigPatch = {}
  if (form.proxyUrl.trim() !== initial.proxyUrl) patch.proxyUrl = form.proxyUrl.trim()
  if (form.proxyUsername.trim()) patch.proxyUsername = form.proxyUsername.trim()
  if (form.proxyPassword) patch.proxyPassword = form.proxyPassword
  if (form.tlsBackend !== initial.tlsBackend) patch.tlsBackend = form.tlsBackend
  if (form.region.trim() !== initial.region) patch.region = form.region.trim()
  if (form.authRegion.trim() !== initial.authRegion) patch.authRegion = form.authRegion.trim()
  if (form.apiRegion.trim() !== initial.apiRegion) patch.apiRegion = form.apiRegion.trim()
  return patch
}

export function NetworkSection({ data }: { data: SettingsView }) {
  const update = useUpdateRuntimeConfig()
  const [form, setForm] = useState<NetworkForm>(() => fromSettings(data))
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  const set = <K extends keyof NetworkForm>(key: K, value: NetworkForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setTestResult(null)
  }

  const proxyError =
    form.proxyUrl.trim() && !PROXY_PATTERN.test(form.proxyUrl.trim()) ? strings.settings.invalidProxy : null
  const regionError = form.region.trim() ? null : strings.settings.invalidRegion
  const patch = buildPatch(data, form)
  const dirty = Object.keys(patch).length > 0

  const save = () =>
    update.mutate(patch, {
      onSuccess: (result) => {
        markSaved(result.restartRequired)
        setForm(fromSettings(result.settings))
        toast.success(strings.settings.saveStatusRestart)
      },
    })

  // 按表单里当前的代理设置测试；用户名、密码留空时沿用已保存的值。
  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(
        await ipc.testConnection({
          proxyUrl: form.proxyUrl.trim(),
          proxyUsername: form.proxyUsername.trim() || undefined,
          proxyPassword: form.proxyPassword || undefined,
        }),
      )
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsCard
      footer={
        <>
          {dirty ? (
            <span className="mr-auto text-[11.5px] text-muted-foreground">{strings.settings.restartFooter}</span>
          ) : null}
          <Button onClick={save} disabled={!dirty || !!proxyError || !!regionError || update.isPending}>
            {strings.common.save}
          </Button>
        </>
      }
    >
      <SettingRow
        label={strings.settings.proxyUrl}
        desc={strings.settings.proxyUrlHint}
        restart
        htmlFor="settings-proxy-url"
        error={proxyError}
      >
        <Input
          id="settings-proxy-url"
          className={INPUT_WIDTH}
          placeholder="http://127.0.0.1:7890"
          value={form.proxyUrl}
          aria-invalid={!!proxyError}
          onChange={(event) => set("proxyUrl", event.target.value)}
        />
      </SettingRow>
      <SettingRow label={strings.settings.proxyUsername} restart htmlFor="settings-proxy-user">
        <Input
          id="settings-proxy-user"
          className={INPUT_WIDTH}
          autoComplete="off"
          placeholder={data.proxyAuthConfigured ? strings.settings.proxyUsernameSet : ""}
          value={form.proxyUsername}
          onChange={(event) => set("proxyUsername", event.target.value)}
        />
      </SettingRow>
      <SettingRow label={strings.settings.proxyPassword} restart htmlFor="settings-proxy-password">
        <Input
          id="settings-proxy-password"
          className={INPUT_WIDTH}
          type="password"
          autoComplete="new-password"
          placeholder={data.proxyAuthConfigured ? strings.settings.proxyPasswordSet : ""}
          value={form.proxyPassword}
          onChange={(event) => set("proxyPassword", event.target.value)}
        />
      </SettingRow>
      <SettingRow label={strings.settings.tlsBackend} restart>
        <Select
          value={form.tlsBackend}
          onValueChange={(value) => set("tlsBackend", String(value) as NetworkForm["tlsBackend"])}
        >
          <SelectTrigger className={INPUT_WIDTH} aria-label={strings.settings.tlsBackend}>
            <span>{form.tlsBackend}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rustls">rustls</SelectItem>
            <SelectItem value="native-tls">native-tls</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        label={strings.settings.region}
        desc={strings.settings.regionHint}
        restart
        htmlFor="settings-region"
        error={regionError}
      >
        <Input
          id="settings-region"
          className={INPUT_WIDTH}
          value={form.region}
          aria-invalid={!!regionError}
          onChange={(event) => set("region", event.target.value)}
        />
      </SettingRow>
      <SettingRow label={strings.accounts.authRegion} restart htmlFor="settings-auth-region">
        <Input
          id="settings-auth-region"
          className={INPUT_WIDTH}
          placeholder={form.region || data.region}
          value={form.authRegion}
          onChange={(event) => set("authRegion", event.target.value)}
        />
      </SettingRow>
      <SettingRow label={strings.accounts.apiRegion} restart htmlFor="settings-api-region">
        <Input
          id="settings-api-region"
          className={INPUT_WIDTH}
          placeholder={form.region || data.region}
          value={form.apiRegion}
          onChange={(event) => set("apiRegion", event.target.value)}
        />
      </SettingRow>
      <SettingRow
        label={strings.settings.testConnection}
        desc={
          testResult ? (
            <span className={cn(testResult.ok ? "text-text-success" : "text-text-danger")}>
              {testResult.ok
                ? strings.settings.testOk(testResult.latencyMs, testResult.status ? ` · HTTP ${testResult.status}` : "")
                : strings.settings.testFailed(testResult.message)}
              <span className="ml-1 text-muted-foreground">· {strings.settings.testTarget(testResult.target)}</span>
            </span>
          ) : undefined
        }
      >
        <Button variant="secondary" size="sm" onClick={() => void test()} disabled={testing || !!proxyError}>
          {testing ? strings.settings.testing : strings.settings.testConnection}
        </Button>
      </SettingRow>
    </SettingsCard>
  )
}
