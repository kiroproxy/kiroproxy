import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CredentialStatusItem } from "@/lib/types"
import { AlertList } from "./AlertList"

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
  email: null,
  nickname: "账号",
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

function renderAlerts(credentials: CredentialStatusItem[]) {
  render(
    <MemoryRouter>
      <AlertList accounts={{ total: credentials.length, available: 0, currentId: 0, credentials }} />
    </MemoryRouter>,
  )
}

it("explains why an account was disabled instead of reporting the failure threshold", () => {
  renderAlerts([
    // 后端自动禁用时把 failureCount 设成阈值 3。
    { ...base, id: 1, nickname: "额度用尽", disabled: true, failureCount: 3, disabledReason: "quota_exceeded" },
    { ...base, id: 2, nickname: "缺 ARN", disabled: true, failureCount: 3, disabledReason: "profile_arn_missing" },
    { ...base, id: 3, nickname: "连续失败", disabled: true, failureCount: 3, disabledReason: "too_many_failures" },
    { ...base, id: 4, nickname: "手动停用", disabled: true, failureCount: 2, throttleCount: 5, disabledReason: "manual" },
    { ...base, id: 5, nickname: "偶尔失败", failureCount: 1 },
  ])

  expect(screen.getByText("本月额度已用尽，下月自动恢复")).toBeInTheDocument()
  expect(screen.getByText("缺少 Profile ARN，补充后才能使用")).toBeInTheDocument()
  expect(screen.getByText("连续失败 3 次，已自动停用")).toBeInTheDocument()
  expect(screen.getByText("连续失败 1 次")).toBeInTheDocument()
  // 只有真正连续失败的账号才报「连续失败 3 次」，手动停用的账号不再提醒。
  expect(screen.queryByText("连续失败 3 次")).not.toBeInTheDocument()
  expect(screen.queryByText("手动停用")).not.toBeInTheDocument()
  expect(screen.getAllByRole("listitem")).toHaveLength(4)
})
