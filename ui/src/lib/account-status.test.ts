import { accountStatus } from "./account-status"
import type { CredentialStatusItem } from "./types"

const base: CredentialStatusItem = {
  id: 1,
  priority: 0,
  disabled: false,
  failureCount: 0,
  isCurrent: false,
  expiresAt: null,
  authMethod: "social",
  hasProfileArn: true,
  refreshTokenHash: "abcdef0123456789",
  email: "main@example.com",
  nickname: "主账号",
  provider: "Google",
  authRegion: null,
  apiRegion: null,
  successCount: 0,
  lastUsedAt: null,
  hasProxy: false,
  proxyUrl: null,
  thinkingAdaptive: false,
  healthStatus: "healthy",
  throttleCount: 0,
  disabledReason: null,
}

/** 后端自动禁用账号时会把 failureCount 设成阈值 3。 */
const autoDisabled = (reason: string): CredentialStatusItem => ({
  ...base,
  disabled: true,
  failureCount: 3,
  disabledReason: reason,
})

describe("accountStatus", () => {
  it("tells automatic disables apart from a manual one", () => {
    expect(accountStatus(autoDisabled("too_many_failures"))).toMatchObject({
      status: "suspended",
      label: "自动停用",
    })
    expect(accountStatus(autoDisabled("profile_arn_missing"))).toMatchObject({
      status: "needsProfileArn",
      label: "缺 Profile ARN",
    })
    expect(accountStatus(autoDisabled("quota_exceeded")).status).toBe("exhausted")
    expect(accountStatus(autoDisabled("invalid_refresh_token")).status).toBe("needsLogin")
    expect(accountStatus({ ...base, disabled: true, disabledReason: "manual" })).toMatchObject({
      status: "disabled",
      label: "已停用",
    })
  })
})
