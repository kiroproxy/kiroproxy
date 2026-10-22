import { useState } from "react"
import { Link } from "react-router-dom"
import { CheckIcon, CopyIcon, TerminalIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { errorMessage, ipc } from "@/lib/ipc"
import { useApiKeys } from "@/lib/queries"
import { strings } from "@/lib/strings"

export interface ConnectCardProps {
  baseUrl: string
}

async function writeClipboard(text: string) {
  await navigator.clipboard.writeText(text)
}

export function ConnectCard({ baseUrl }: ConnectCardProps) {
  const keys = useApiKeys()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const key = keys.data?.find((item) => item.enabled) ?? keys.data?.[0]

  const copyBaseUrl = async () => {
    try {
      await writeClipboard(baseUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const copyEnv = async () => {
    if (!key) return
    setBusy(true)
    try {
      const secret = await ipc.getApiKeySecret(key.id)
      await writeClipboard(
        `export ANTHROPIC_BASE_URL="${baseUrl}"\nexport ANTHROPIC_API_KEY="${secret}"`,
      )
      toast.success(strings.overview.envCopied)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>{strings.overview.connectTitle}</CardTitle>
        <Link to="/connect" className="text-[12px] font-medium text-primary hover:underline">
          {strings.nav.connect}
        </Link>
      </div>

      <div className="grid gap-1.5">
        <span className="text-[11.5px] text-muted-foreground">{strings.overview.baseUrl}</span>
        <div className="flex items-center gap-2">
          <Input readOnly value={baseUrl} className="num" aria-label={strings.overview.baseUrl} />
          <Button variant="secondary" size="sm" onClick={() => void copyBaseUrl()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? strings.common.copied : strings.common.copy}
          </Button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className="text-[11.5px] text-muted-foreground">{strings.overview.defaultKey}</span>
        {key ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[12.5px] font-medium">{key.name}</span>
            <code className="num truncate font-mono text-[11.5px] text-muted-foreground">
              {key.maskedKey}
            </code>
          </div>
        ) : (
          <span className="text-[12px] text-muted-foreground">
            {keys.isLoading ? strings.overview.keyLoading : strings.overview.noKeys}
          </span>
        )}
      </div>

      <Button variant="secondary" disabled={!key || busy} onClick={() => void copyEnv()}>
        <TerminalIcon />
        {strings.overview.copyEnv}
      </Button>
    </Card>
  )
}
