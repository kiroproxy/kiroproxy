import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CredentialStatusItem } from "@/lib/types"
import { AccountTable } from "./AccountTable"

vi.mock("@/lib/queries", () => ({
  useAccountBalance: (id: number) => ({
    data:
      id === 3
        ? { id, currentUsage: 950, usageLimit: 1000, remaining: 50, usagePercentage: 95, nextResetAt: null }
        : { id, currentUsage: 413, usageLimit: 1000, remaining: 587, usagePercentage: 41.3, nextResetAt: null },
    isLoading: false,
    isError: false,
  }),
  useDeleteAccount: () => ({ mutate: vi.fn() }),
  useResetFailure: () => ({ mutate: vi.fn() }),
  useSetDisabled: () => ({ mutate: vi.fn() }),
  useSetPriority: () => ({ mutate: vi.fn() }),
}))

const baseAccount: CredentialStatusItem = {
  id: 1,
  priority: 0,
  disabled: false,
  failureCount: 0,
  isCurrent: true,
  expiresAt: null,
  authMethod: "social",
  hasProfileArn: false,
  refreshTokenHash: "abcdef0123456789",
  email: "main@example.com",
  nickname: "主账号",
  provider: "Google",
  authRegion: null,
  apiRegion: null,
  successCount: 12,
  lastUsedAt: null,
  hasProxy: false,
  proxyUrl: null,
  thinkingAdaptive: false,
  healthStatus: "healthy",
  throttleCount: 0,
  disabledReason: null,
}

const unstable: CredentialStatusItem = {
  ...baseAccount,
  id: 2,
  priority: 1,
  isCurrent: false,
  email: "backup@example.com",
  nickname: "备用账号",
  healthStatus: "degraded",
}

const nearlyEmpty: CredentialStatusItem = {
  ...baseAccount,
  id: 3,
  priority: 2,
  isCurrent: false,
  email: "third@example.com",
  nickname: "第三账号",
}

it("derives status pills from health and monthly quota", () => {
  render(
    <MemoryRouter>
      <AccountTable accounts={[baseAccount, unstable, nearlyEmpty]} />
    </MemoryRouter>,
  )
  expect(screen.getByText("主账号")).toBeInTheDocument()
  expect(screen.getByText("可用")).toBeInTheDocument()
  // degraded 表示连续失败或限流，与额度无关。
  expect(screen.getByText("不稳定")).toBeInTheDocument()
  expect(screen.getByText("额度将尽")).toBeInTheDocument()
  expect(screen.getAllByText("413 / 1,000").length).toBeGreaterThan(0)
})

it("does not wrap the table in a scroll container that would stop the header from sticking", () => {
  render(
    <MemoryRouter>
      <AccountTable accounts={[baseAccount]} />
    </MemoryRouter>,
  )
  // overflow: hidden 也会成为 sticky 的参照；圆角裁切改用 overflow: clip。
  expect(screen.getByRole("table").closest(".overflow-hidden, .overflow-auto, .overflow-y-auto")).toBeNull()
})
