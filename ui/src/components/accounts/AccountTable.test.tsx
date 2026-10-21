import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CredentialStatusItem } from "@/lib/types"
import { AccountTable } from "./AccountTable"

vi.mock("@/lib/queries", () => ({
  useAccountBalance: () => ({ data: undefined, isLoading: false }),
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

const accountA: CredentialStatusItem = baseAccount

const accountB: CredentialStatusItem = {
  ...baseAccount,
  id: 2,
  priority: 1,
  isCurrent: false,
  email: "backup@example.com",
  nickname: "备用账号",
  healthStatus: "degraded",
}

it("renders account rows and status pills", () => {
  render(
    <MemoryRouter>
      <AccountTable accounts={[accountA, accountB]} />
    </MemoryRouter>,
  )
  expect(screen.getByText("主账号")).toBeInTheDocument()
  expect(screen.getByText("可用")).toBeInTheDocument()
  expect(screen.getByText("额度将尽")).toBeInTheDocument()
})
