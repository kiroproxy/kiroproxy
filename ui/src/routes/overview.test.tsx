import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { OverviewPage } from "./overview"

const fixtures = vi.hoisted(() => {
  const pad = (n: number) => String(n).padStart(2, "0")
  const ymd = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const summary = (date: string, requests: number) => ({
    date,
    totalRequests: requests,
    totalCost: 1.25,
    totalCredits: 12.5,
    totalCreditsSaved: 0,
    totalInputTokens: 98765,
    totalOutputTokens: 1000,
    totalCacheReadTokens: 1000,
  })
  return {
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
    // 后端按日期降序返回。
    daily: [summary(ymd(0), 1234), summary(ymd(-1), 1000)],
  }
})

vi.mock("@/lib/queries", () => ({
  useAccounts: () => ({
    data: { total: 2, available: 2, currentId: 1, credentials: [fixtures.account] },
    isLoading: false,
  }),
  useDailyUsage: () => ({ data: fixtures.daily, isLoading: false }),
  useRpm: () => ({ data: { global: 3, byCredential: { "1": 3 }, byApiKey: {} }, isLoading: false }),
  useServerStatus: () => ({
    data: { running: true, host: "127.0.0.1", port: 5678, baseUrl: "http://127.0.0.1:5678" },
    isLoading: false,
  }),
  useApiKeys: () => ({
    data: [
      {
        id: 1,
        name: "本机默认",
        maskedKey: "sk-kp-a3f9••••c21e",
        enabled: true,
        createdAt: "",
        limitUnit: "usd",
        usedAmount: 0,
      },
    ],
    isLoading: false,
  }),
  useAccountBalance: () => ({ data: undefined, isLoading: false, isError: false }),
}))

it("shows server status, today's metrics with day-over-day change and the real key", () => {
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  )
  expect(screen.getByText("代理运行中")).toBeInTheDocument()
  expect(screen.getByText("1,234")).toBeInTheDocument()
  expect(screen.getByText("较昨日 +23%")).toBeInTheDocument()
  expect(screen.getByText("本机默认")).toBeInTheDocument()
  expect(screen.getByText("sk-kp-a3f9••••c21e")).toBeInTheDocument()
})
