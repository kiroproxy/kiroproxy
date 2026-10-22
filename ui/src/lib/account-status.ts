import { strings } from "./strings"
import type { BalanceResponse, CredentialStatusItem } from "./types"

/** 账号在 UI 中的展示状态。 */
export type AccountStatus =
  | "available"
  | "lowQuota"
  | "unstable"
  | "exhausted"
  | "needsLogin"
  | "disabled"

export type AccountBadgeVariant = "success" | "warning" | "danger" | "info" | "neutral"

export interface AccountStatusInfo {
  status: AccountStatus
  label: string
  variant: AccountBadgeVariant
}

const STATUS_INFO: Record<AccountStatus, { label: string; variant: AccountBadgeVariant }> = {
  available: { label: strings.status.available, variant: "success" },
  lowQuota: { label: strings.status.lowQuota, variant: "warning" },
  unstable: { label: strings.status.unstable, variant: "warning" },
  exhausted: { label: strings.status.exhausted, variant: "danger" },
  needsLogin: { label: strings.status.needsLogin, variant: "info" },
  disabled: { label: strings.status.disabled, variant: "neutral" },
}

/** 月度使用率达到该值时视为额度将尽（与额度条换色阈值一致）。 */
export const LOW_QUOTA_PERCENT = 90

/** 后端对不支持额度查询的账号返回 0 限额，此时没有可展示的额度。 */
export function hasQuota(balance?: BalanceResponse | null): balance is BalanceResponse {
  return !!balance && balance.usageLimit > 0
}

/**
 * 从后端返回的凭据状态推导展示状态。
 * - quota_exceeded 视为已用尽；refreshToken 失效类原因视为需登录；其余禁用视为手动停用；
 * - healthStatus 为 degraded / unhealthy 表示连续失败或频繁限流，显示为「不稳定」；
 * - 传入余额且月度使用率达到 90% 时显示为「额度将尽」。
 */
export function accountStatus(
  item: CredentialStatusItem,
  balance?: BalanceResponse | null,
): AccountStatusInfo {
  const reason = item.disabledReason ?? ""
  let status: AccountStatus = "available"
  if (reason === "quota_exceeded") {
    status = "exhausted"
  } else if (reason === "invalid_refresh_token" || reason === "too_many_refresh_failures") {
    status = "needsLogin"
  } else if (item.disabled) {
    status = "disabled"
  } else if (item.healthStatus === "degraded" || item.healthStatus === "unhealthy") {
    status = "unstable"
  } else if (hasQuota(balance) && balance.usagePercentage >= LOW_QUOTA_PERCENT) {
    status = balance.usagePercentage >= 100 ? "exhausted" : "lowQuota"
  }
  return { status, ...STATUS_INFO[status] }
}

export function accountName(item: CredentialStatusItem): string {
  return item.nickname || item.email || `#${item.id}`
}

/** 邮箱脱敏：`alice@example.com` → `a***@example.com`。 */
export function maskEmail(email?: string | null): string | null {
  if (!email) return null
  const [local, domain] = email.split("@")
  if (!domain || !local) return email
  const head = local.slice(0, 1)
  return `${head}***@${domain}`
}

export type AccountStatusFilter = "all" | AccountStatus

export const accountStatusFilters: AccountStatusFilter[] = [
  "all",
  "available",
  "lowQuota",
  "unstable",
  "exhausted",
  "needsLogin",
  "disabled",
]

export function matchesStatusFilter(
  item: CredentialStatusItem,
  filter: AccountStatusFilter,
  balance?: BalanceResponse | null,
): boolean {
  return filter === "all" || accountStatus(item, balance).status === filter
}

/** 额度条颜色：正常 quota，达到 90% 换 warning，用尽换 danger。 */
export function quotaTone(percent: number): "quota" | "warning" | "danger" {
  if (percent >= 100) return "danger"
  if (percent >= LOW_QUOTA_PERCENT) return "warning"
  return "quota"
}
