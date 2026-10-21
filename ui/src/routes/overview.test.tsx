import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { OverviewPage } from "./overview"

const fixtures = vi.hoisted(() => ({
  account: {
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
  },
  today: {
    date: "2026-10-21",
    totalRequests: 1234,
    totalCost: 1.25,
    totalCredits: 12.5,
    totalCreditsSaved: 0,
    totalInputTokens: 98765,
    totalCacheReadTokens: 1000,
  },
}))

vi.mock("@/lib/queries", () => ({
  useAccounts: () => ({
    data: { total: 2, available: 2, currentId: 1, credentials: [fixtures.account] },
    isLoading: false,
  }),
  useDailyUsage: () => ({ data: [fixtures.today], isLoading: false }),
  useRpm: () => ({
    data: { global: 3, byCredential: { "1": 3 }, byApiKey: {} },
    isLoading: false,
  }),
  useServerStatus: () => ({
    data: { running: true, host: "127.0.0.1", port: 5678 },
    isLoading: false,
  }),
  useSettings: () => ({ data: { version: "0.1.0" }, isLoading: false }),
}))

it("shows server status and today's metrics", () => {
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  )
  expect(screen.getByText("代理运行中")).toBeInTheDocument()
  expect(screen.getByText("1,234")).toBeInTheDocument()
  expect(screen.getByText("本机默认")).toBeInTheDocument()
})
