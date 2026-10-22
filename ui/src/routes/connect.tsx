import { useMemo, useState } from "react"
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePageHeader } from "@/components/shell/page-header"
import { errorMessage, ipc } from "@/lib/ipc"
import { useApiKeys, useServerStatus } from "@/lib/queries"
import { strings } from "@/lib/strings"

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(strings.common.copied)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11.5px] text-muted-foreground">{label}</span>
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
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

export function ConnectPage() {
  const server = useServerStatus()
  const keys = useApiKeys()
  const [keyId, setKeyId] = useState<string>("")
  const [secret, setSecret] = useState("")

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

  const apiKey = secret || strings.connect.keyPlaceholder

  const claudeEnv = `export ANTHROPIC_BASE_URL="${baseUrl}"
export ANTHROPIC_API_KEY="${apiKey}"`

  const claudeSettings = JSON.stringify(
    { env: { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_API_KEY: apiKey } },
    null,
    2,
  )

  const codexConfig = `model = "gpt-5.6-terra"
model_provider = "kiro"

[model_providers.kiro]
name = "KiroProxy"
base_url = "${baseUrl}/v1"
wire_api = "responses"
env_key = "KIRO_API_KEY"`

  const codexEnv = `KIRO_API_KEY=${apiKey}`

  const openaiPython = `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}/v1", api_key="${apiKey}")
resp = client.chat.completions.create(
    model="gpt-5.6-terra",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)`

  const ccSwitch = JSON.stringify({ name: "KiroProxy", baseUrl, apiKey }, null, 2)

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
          <CodeBlock label={strings.connect.envVars} code={claudeEnv} />
          <CodeBlock label={strings.connect.settingsJson} code={claudeSettings} />
        </TabsContent>

        <TabsContent value="codex" className="flex flex-col gap-4">
          <CodeBlock label={strings.connect.codexConfig} code={codexConfig} />
          <CodeBlock label={strings.connect.codexEnv} code={codexEnv} />
        </TabsContent>

        <TabsContent value="openai" className="flex flex-col gap-4">
          <CodeBlock label={strings.connect.pythonExample} code={openaiPython} />
        </TabsContent>

        <TabsContent value="ccswitch" className="flex flex-col gap-3">
          <p className="text-[12.5px] text-muted-foreground">{strings.connect.ccSwitchHint}</p>
          <CodeBlock label="cc-switch" code={ccSwitch} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
