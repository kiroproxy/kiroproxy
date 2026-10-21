import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { accountStatus, maskEmail } from "@/lib/account-status"
import { fmtDateTime } from "@/lib/format"
import { strings } from "@/lib/strings"
import type { CredentialStatusItem } from "@/lib/types"

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 text-[12px]">
      <span className="w-[92px] shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all font-medium">{value || "—"}</span>
    </div>
  )
}

export function AccountInfoCard({ item }: { item: CredentialStatusItem }) {
  const status = accountStatus(item)
  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <CardTitle className="font-serif">{strings.accounts.info}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2.5 md:grid-cols-2">
        <InfoRow label={strings.accounts.columns.status} value={status.label} />
        <InfoRow label={strings.accounts.authMethod} value={item.authMethod} />
        <InfoRow label={strings.accounts.provider} value={item.provider} />
        <InfoRow label="Email" value={maskEmail(item.email)} />
        <InfoRow label={strings.accounts.authRegion} value={item.authRegion} />
        <InfoRow label={strings.accounts.apiRegion} value={item.apiRegion} />
        <InfoRow label={strings.accounts.tokenHash} value={item.refreshTokenHash?.slice(0, 12)} />
        <InfoRow label={strings.accounts.profileArn} value={item.hasProfileArn ? "已配置" : "—"} />
        <InfoRow label={strings.accounts.proxy} value={item.proxyUrl ?? "—"} />
        <InfoRow
          label={strings.accounts.thinkingAdaptive}
          value={item.thinkingAdaptive ? strings.common.enabled : strings.common.disabled}
        />
        <InfoRow label={strings.accounts.priorityLabel} value={`#${item.priority + 1}`} />
        <InfoRow label="成功次数" value={String(item.successCount)} />
        <InfoRow label="失败次数" value={String(item.failureCount)} />
        <InfoRow label="最近使用" value={fmtDateTime(item.lastUsedAt)} />
        <InfoRow label="过期时间" value={fmtDateTime(item.expiresAt)} />
      </CardContent>
    </Card>
  )
}
