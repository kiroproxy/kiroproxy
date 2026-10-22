import { fmtCost, fmtCredits, fmtDateTime } from "./format"
import { strings } from "./strings"
import type { ApiKeyView } from "./types"

/** 「已用 / 额度」文字；没有额度时显示「不限额度」。 */
export function quotaText(key: ApiKeyView): string {
  if (key.spendingLimit == null) return strings.keys.noLimit
  if (key.limitUnit === "credits") {
    return `${fmtCredits(key.usedAmount)} / ${fmtCredits(key.spendingLimit)} credits`
  }
  return `${fmtCost(key.usedAmount)} / ${fmtCost(key.spendingLimit)}`
}

export function quotaPercent(key: ApiKeyView): number {
  if (key.spendingLimit == null || key.spendingLimit <= 0) return 0
  return Math.min(100, (key.usedAmount / key.spendingLimit) * 100)
}

/** 有效期：懒激活的密钥在第一次使用前显示天数，激活后显示到期时间。 */
export function validityText(key: ApiKeyView): string {
  if (key.durationDays != null && !key.activatedAt) return strings.keys.validAfterFirstUse(key.durationDays)
  if (key.expiresAt) return fmtDateTime(key.expiresAt)
  return strings.keys.validForever
}
