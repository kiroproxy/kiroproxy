import { useMemo, useState } from "react"
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePageHeader } from "@/components/shell/page-header"
import { errorMessage, ipc } from "@/lib/ipc"
import { useApiKeys, useModels, useServerStatus } from "@/lib/queries"
import { strings } from "@/lib/strings"

/** 模型列表还没取到（或上游不可用）时的兜底模型。 */
const FALLBACK_MODEL = "gpt-5.6-terra"

/**
 * 代码片段：页面上显示掩码密钥，复制时由 resolve 生成带真实密钥的版本，
 * 和概览页「复制环境变量」、密钥页「复制」的行为一致。
 */
function CodeBlock({
  label,
  code,
  resolve,
}: {
  label: string
  code: string
  resolve: () => Promise<string>
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const copy = async () => {
    setBusy(true)
    try {
      await navigator.clipboard.writeText(await resolve())
      setCopied(true)
      toast.success(strings.common.copied)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11.5px] text-muted-foreground">{label}</span>
        <Button variant="secondary" size="sm" onClick={() => void copy()} disabled={busy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? strings.common.copied : strings.common.copy}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-[12px] border border-border bg-subtle p-3 font-mono text-[12px] leading-5 break-all whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  )
}

function ModelPicker({
  value,
  models,
  onChange,
}: {
  value: string
  models: string[]
  onChange: (model: string) => void
}) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <span>{strings.connect.model}</span>
      <Select value={value} onValueChange={(next) => onChange(String(next))}>
        <SelectTrigger className="w-[240px]" aria-label={strings.connect.model}>
          <span className="truncate font-mono text-[12px]">{value}</span>
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model} value={model}>
              <span className="font-mono text-[12px]">{model}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const snippets = {
  claudeEnv: (baseUrl: string, apiKey: string) =>
    `export ANTHROPIC_BASE_URL="${baseUrl}"
export ANTHROPIC_API_KEY="${apiKey}"`,
  claudeSettings: (baseUrl: string, apiKey: string) =>
    JSON.stringify({ env: { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_API_KEY: apiKey } }, null, 2),
  codexConfig: (baseUrl: string, model: string) => `model = "${model}"
model_provider = "kiro"

[model_providers.kiro]
name = "KiroProxy"
base_url = "${baseUrl}/v1"
wire_api = "responses"
env_key = "KIRO_API_KEY"`,
  codexEnv: (apiKey: string) => `KIRO_API_KEY=${apiKey}`,
  openaiPython: (baseUrl: string, apiKey: string, model: string) => `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}/v1", api_key="${apiKey}")
resp = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)`,
  ccSwitch: (baseUrl: string, apiKey: string) =>
    JSON.stringify({ name: "KiroProxy", baseUrl, apiKey }, null, 2),
}

export function ConnectPage() {
  const server = useServerStatus()
  const keys = useApiKeys()
  const models = useModels()
  const [keyId, setKeyId] = useState<string>("")
  const [secret, setSecret] = useState("")
  const [modelChoice, setModelChoice] = useState<string | null>(null)

  usePageHeader({ back: -1 }, [])

  const baseUrl =
    server.data?.baseUrl || `http://${server.data?.host ?? "127.0.0.1"}:${server.data?.port ?? 5678}`
  const selected = useMemo(
    () =>
      keys.data?.find((key) => String(key.id) === keyId) ??
      keys.data?.find((key) => key.enabled) ??
      keys.data?.[0],
    [keyId, keys.data],
  )

  // 模型从上游列表里选；默认优先 GPT / Codex 系，列表不可用时退回兜底模型。
  const modelIds = useMemo(() => {
    const ids = (models.data ?? []).map((model) => model.id)
    return ids.length > 0 ? ids : [FALLBACK_MODEL]
  }, [models.data])
  const model =
    (modelChoice && modelIds.includes(modelChoice) ? modelChoice : null) ??
    modelIds.find((id) => /gpt|codex/i.test(id)) ??
    modelIds[0]

  const toggleSecret = async () => {
    if (secret) {
      setSecret("")
      return
    }
    if (!selected) return
    try {
      setSecret(await ipc.getApiKeySecret(selected.id))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  // 页面上显示掩码（点「显示」后才是明文）；复制时总是填入真实密钥，未显示时临时向后端读取一次。
  const shownKey = secret || selected?.maskedKey || strings.connect.keyPlaceholder
  const realKey = async () =>
    secret || (selected ? await ipc.getApiKeySecret(selected.id) : strings.connect.keyPlaceholder)

  return (
    <section aria-label={strings.connect.title} className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11.5px] text-muted-foreground">{strings.connect.baseUrl}</span>
            <code className="font-mono text-[12.5px] font-semibold">{baseUrl}</code>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {keys.data && keys.data.length > 0 ? (
              <>
                <Select
                  value={String(selected?.id ?? "")}
                  onValueChange={(value) => {
                    setKeyId(String(value))
                    setSecret("")
                  }}
                >
                  <SelectTrigger className="w-[200px]" aria-label={strings.connect.selectKey}>
                    <span className="truncate">{selected?.name ?? strings.connect.selectKey}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {keys.data.map((key) => (
                      <SelectItem key={key.id} value={String(key.id)}>
                        {key.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="secondary" onClick={() => void toggleSecret()}>
                  {secret ? <EyeOffIcon /> : <EyeIcon />}
                  {secret ? strings.connect.hideKey : strings.connect.revealKey}
                </Button>
              </>
            ) : (
              <span className="text-[12px] text-muted-foreground">{strings.connect.noKeys}</span>
            )}
          </div>
          {selected ? (
            <p className="basis-full text-[11.5px] text-muted-foreground">{strings.connect.copyHint}</p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="claude" className="gap-3">
        <TabsList>
          <TabsTrigger value="claude">{strings.connect.claudeCode}</TabsTrigger>
          <TabsTrigger value="codex">{strings.connect.codex}</TabsTrigger>
          <TabsTrigger value="openai">{strings.connect.openaiSdk}</TabsTrigger>
          <TabsTrigger value="ccswitch">{strings.connect.ccSwitch}</TabsTrigger>
        </TabsList>

        <TabsContent value="claude" className="flex flex-col gap-4">
          <CodeBlock
            label={strings.connect.envVars}
            code={snippets.claudeEnv(baseUrl, shownKey)}
            resolve={async () => snippets.claudeEnv(baseUrl, await realKey())}
          />
          <CodeBlock
            label={strings.connect.settingsJson}
            code={snippets.claudeSettings(baseUrl, shownKey)}
            resolve={async () => snippets.claudeSettings(baseUrl, await realKey())}
          />
        </TabsContent>

        <TabsContent value="codex" className="flex flex-col gap-4">
          <ModelPicker value={model} models={modelIds} onChange={setModelChoice} />
          <CodeBlock
            label={strings.connect.codexConfig}
            code={snippets.codexConfig(baseUrl, model)}
            resolve={async () => snippets.codexConfig(baseUrl, model)}
          />
          <CodeBlock
            label={strings.connect.codexEnv}
            code={snippets.codexEnv(shownKey)}
            resolve={async () => snippets.codexEnv(await realKey())}
          />
        </TabsContent>

        <TabsContent value="openai" className="flex flex-col gap-4">
          <ModelPicker value={model} models={modelIds} onChange={setModelChoice} />
          <CodeBlock
            label={strings.connect.pythonExample}
            code={snippets.openaiPython(baseUrl, shownKey, model)}
            resolve={async () => snippets.openaiPython(baseUrl, await realKey(), model)}
          />
        </TabsContent>

        <TabsContent value="ccswitch" className="flex flex-col gap-3">
          <p className="text-[12.5px] text-muted-foreground">{strings.connect.ccSwitchHint}</p>
          <CodeBlock
            label="cc-switch"
            code={snippets.ccSwitch(baseUrl, shownKey)}
            resolve={async () => snippets.ccSwitch(baseUrl, await realKey())}
          />
        </TabsContent>
      </Tabs>
    </section>
  )
}
