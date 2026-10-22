import { Badge } from "@/components/ui/badge"
import { accountStatus } from "@/lib/account-status"
import { useAccountBalance } from "@/lib/queries"
import type { CredentialStatusItem } from "@/lib/types"

/** 状态徽章同时参考余额（与额度列共用同一个查询缓存），以便显示「额度将尽」。 */
export function AccountStatusBadge({ item }: { item: CredentialStatusItem }) {
  const balance = useAccountBalance(item.id, !item.disabled)
  const info = accountStatus(item, balance.data)
  return <Badge variant={info.variant}>{info.label}</Badge>
}
