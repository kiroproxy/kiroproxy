import { Badge } from "@/components/ui/badge"
import { accountStatus } from "@/lib/account-status"
import type { CredentialStatusItem } from "@/lib/types"

export function AccountStatusBadge({ item }: { item: CredentialStatusItem }) {
  const info = accountStatus(item)
  return <Badge variant={info.variant}>{info.label}</Badge>
}
