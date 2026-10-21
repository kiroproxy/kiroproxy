import { useMemo, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ipc } from "@/lib/ipc"
import { useApiKeys, useServerStatus } from "@/lib/queries"
import { strings } from "@/lib/strings"

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(strings.common.copied)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error(strings.errors.actionFailed)
    }
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-[12px] bg-subtle p-3 font-mono text-[11.5px] leading-5">
        {code}
      </pre>
      <Button
        variant="secondary"
        size="sm"
        className="absolute right-2 top-2"
        onClick={copy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {strings.common.copy}
      </Button>
    </div>
  )
}

function Panel({ title, code }: { title: string; code: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-muted-foreground">{title}</span>
      <CodeBlock code={code} />
    </div>
  )
}

export function ConnectPage() {
  const server = useServerStatus()
  const keys = useApiKeys()
  const [keyId, setKeyId] = useState<string>("")
  const [secret, setSecret] = useState("")

  const baseUrl = server.data?.baseUrl || `http://${server.data?.host ?? "127.0.0.1"}:${server.data?.port ?? 5678}`
  const selected = useMemo(
    () => keys.data?.find((key) => String(key.id) === keyId) ?? keys.data?.[0],
    [keyId, keys.data],
  )

  const reveal = async () => {
    if (!selected) return
    try {
      setSecret(await ipc.getApiKeySecret(selected.id))
    } catch (error) {
      toast.error((error as { message?: string }).message ?? strings.errors.actionFailed)
    }
  }

  const apiKey = secret || "<在密钥页复制你的 API Key>"

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

  return (
    <section aria-label={strings.connect.title} className="mx-auto flex w-full max-w-[860px] flex-col gap-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{strings.connect.baseUrl}</span>
            <code className="font-mono text-[12.5px] font-semibold">{baseUrl}</code>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={String(selected?.id ?? "")}
              onValueChange={(value) => {
                setKeyId(String(value))
                setSecret("")
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={strings.connect.selectKey} />
              </SelectTrigger>
              <SelectContent>
                {(keys.data ?? []).map((key) => (
                  <SelectItem key={key.id} value={String(key.id)}>
                    {key.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={() => void reveal()}>
              {strings.connect.apiKey}
            </Button>
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

        <TabsContent value="claude" className="flex flex-col gap-3">
          <Panel title="环境变量" code={claudeEnv} />
          <Panel title={strings.connect.settingsJson} code={claudeSettings} />
        </TabsContent>

        <TabsContent value="codex" className="flex flex-col gap-3">
          <Panel title={strings.connect.codexConfig} code={codexConfig} />
          <Panel title={strings.connect.codexEnv} code={codexEnv} />
        </TabsContent>

        <TabsContent value="openai" className="flex flex-col gap-3">
          <Panel title={strings.connect.pythonExample} code={openaiPython} />
        </TabsContent>

        <TabsContent value="ccswitch" className="flex flex-col gap-3">
          <Card>
            <CardContent className="flex flex-col gap-2 pt-1 text-[12.5px]">
              <p className="text-muted-foreground">{strings.connect.ccSwitchHint}</p>
              <CodeBlock
                code={`{"name":"KiroProxy","baseUrl":"${baseUrl}","apiKey":"${apiKey}"}`}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  )
}
