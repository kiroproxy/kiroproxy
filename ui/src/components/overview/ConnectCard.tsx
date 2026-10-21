import { useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { strings } from "@/lib/strings"

export interface ConnectCardProps {
  baseUrl: string
}

export function ConnectCard({ baseUrl }: ConnectCardProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(baseUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // 剪贴板不可用时保持原状，用户仍可手动选择文本。
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
          <Input readOnly value={baseUrl} className="num" />
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? strings.common.copied : strings.common.copy}
          </Button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className="text-[11.5px] text-muted-foreground">{strings.overview.defaultKey}</span>
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-medium">{strings.connect.defaultKey}</span>
          <span className="num text-[12px] text-faint">{strings.overview.keyMask}</span>
        </div>
      </div>
    </Card>
  )
}
