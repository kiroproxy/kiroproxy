import { strings } from "./strings"
import type { CredentialStatusItem } from "./types"

/** 账号在 UI 中的展示状态。 */
export type AccountStatus = "available" | "lowQuota" | "exhausted" | "needsLogin" | "disabled"

export type AccountBadgeVariant = "success" | "warning" | "danger" | "info" | "neutral"

export interface AccountStatusInfo {
  status: AccountStatus
  label: string
  variant: AccountBadgeVariant
}

const STATUS_INFO: Record<AccountStatus, { label: string; variant: AccountBadgeVariant }> = {
  available: { label: strings.status.available, variant: "success" },
  lowQuota: { label: strings.status.lowQuota, variant: "warning" },
  exhausted: { label: strings.status.exhausted, variant: "danger" },
  needsLogin: { label: strings.status.needsLogin, variant: "info" },
  disabled: { label: strings.status.disabled, variant: "neutral" },
}

/**
 * 从后端返回的凭据状态推导展示状态。
 * 后端目前没有 5h/7d 额度百分比，只有禁用原因与健康状态：
 * - quota_exceeded 视为已用尽；
 * - refreshToken 失效类原因视为需登录；
 * - 其余禁用视为手动停用；
 * - 健康状态 degraded/unhealthy 视为额度将尽（限流压力）。
 */
export function accountStatus(item: CredentialStatusItem): AccountStatusInfo {
  const reason = item.disabledReason ?? ""
  let status: AccountStatus = "available"
  if (reason === "quota_exceeded") {
    status = "exhausted"
  } else if (reason === "invalid_refresh_token" || reason === "too_many_refresh_failures") {
    status = "needsLogin"
  } else if (item.disabled) {
    status = "disabled"
  } else if (item.healthStatus === "degraded" || item.healthStatus === "unhealthy") {
    status = "lowQuota"
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
  "exhausted",
  "needsLogin",
  "disabled",
]

export function matchesStatusFilter(item: CredentialStatusItem, filter: AccountStatusFilter): boolean {
  return filter === "all" || accountStatus(item).status === filter
}

export interface AccountQuota {
  /** 5 小时已用百分比；null 表示后端未提供。 */
  fiveHour: number | null
  /** 7 天已用百分比；null 表示后端未提供。 */
  sevenDay: number | null
}

/**
 * 额度百分比。上游 `get_account_balance` 只返回一个月度使用率，
 * 没有 5 小时 / 7 天窗口数据；这里只在已知额度耗尽时返回 100，
 * 其余情况返回 null，由 UI 显示占位符而不是编造数字。
 */
export function accountQuota(item: CredentialStatusItem): AccountQuota {
  if (accountStatus(item).status === "exhausted") {
    return { fiveHour: 100, sevenDay: 100 }
  }
  return { fiveHour: null, sevenDay: null }
}

export function quotaLabel(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`
}
