import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { maskEmail } from "@/lib/account-status"
import { fmtDateTime, fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"
import type { CredentialStatusItem } from "@/lib/types"

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 text-[12px]">
      <dt className="w-[96px] shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-all">{value || "—"}</dd>
    </div>
  )
}

export function AccountInfoCard({ item }: { item: CredentialStatusItem }) {
  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <CardTitle>{strings.accounts.info}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2.5 md:grid-cols-2">
          <InfoRow label={strings.accounts.authMethod} value={item.authMethod} />
          <InfoRow label={strings.accounts.provider} value={item.provider} />
          <InfoRow label={strings.accounts.email} value={maskEmail(item.email)} />
          <InfoRow label={strings.accounts.priorityLabel} value={`#${item.priority + 1}`} />
          <InfoRow label={strings.accounts.authRegion} value={item.authRegion} />
          <InfoRow label={strings.accounts.apiRegion} value={item.apiRegion} />
          <InfoRow
            label={strings.accounts.tokenHash}
            value={
              item.refreshTokenHash ? (
                <code className="font-mono text-[11.5px]">{item.refreshTokenHash.slice(0, 12)}</code>
              ) : (
                strings.accounts.tokenHashMissing
              )
            }
          />
          <InfoRow
            label={strings.accounts.profileArn}
            value={item.hasProfileArn ? strings.common.configured : null}
          />
          <InfoRow label={strings.accounts.proxy} value={item.proxyUrl} />
          <InfoRow
            label={strings.accounts.thinkingAdaptive}
            value={item.thinkingAdaptive ? strings.common.enabled : strings.common.disabled}
          />
          <InfoRow label={strings.accounts.successCount} value={fmtNumber(item.successCount)} />
          <InfoRow label={strings.accounts.failureCount} value={fmtNumber(item.failureCount)} />
          <InfoRow label={strings.accounts.lastUsed} value={fmtDateTime(item.lastUsedAt)} />
          <InfoRow label={strings.accounts.expiresAt} value={fmtDateTime(item.expiresAt)} />
        </dl>
      </CardContent>
    </Card>
  )
}
