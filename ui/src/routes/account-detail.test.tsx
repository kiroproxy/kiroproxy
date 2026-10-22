import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { AppShell } from "@/components/shell/AppShell"
import { AccountDetailPage } from "./account-detail"

vi.mock("@/lib/queries", () => {
  const account = {
    id: 1,
    priority: 0,
    disabled: false,
    failureCount: 0,
    isCurrent: true,
    expiresAt: null,
    authMethod: "social",
    hasProfileArn: true,
    refreshTokenHash: "abcdef1234567890",
    email: "main@example.com",
    nickname: "主账号",
    provider: "Google",
    authRegion: "us-east-1",
    apiRegion: "us-east-1",
    successCount: 12,
    lastUsedAt: null,
    hasProxy: false,
    proxyUrl: null,
    thinkingAdaptive: true,
    healthStatus: "healthy",
    throttleCount: 0,
    disabledReason: null,
  }
  const emptyPage = { data: { records: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }, isLoading: false }
  return {
    queryKeys: {
      accounts: ["accounts"],
      balance: (id: number) => ["balance", id],
      accountModels: (id: number) => ["accountModels", id],
      credentialToday: (id: number) => ["credentialToday", id],
    },
    useAccounts: () => ({
      data: { total: 1, available: 1, currentId: 1, credentials: [account] },
      isLoading: false,
    }),
    useServerStatus: () => ({ data: { running: true, host: "127.0.0.1", port: 5678, baseUrl: "" } }),
    useRpm: () => ({ data: { global: 0, byCredential: {}, byApiKey: {} } }),
    useAppInfo: () => ({ data: { version: "0.1.0" } }),
    useApiKeys: () => ({ data: [] }),
    useAccountBalance: () => ({
      data: { id: 1, currentUsage: 10, usageLimit: 100, remaining: 90, usagePercentage: 10 },
      isLoading: false,
    }),
    useAccountModels: () => ({ data: [], isLoading: false }),
    useCredentialTodaySummary: () => ({
      data: { totalRequests: 86, totalInputTokens: 0, totalOutputTokens: 0, totalCredits: 0, totalCost: 7.42 },
      isLoading: false,
    }),
    useCredentialUsageRecords: () => emptyPage,
    useThrottleLogs: () => emptyPage,
    useFailureLogs: () => emptyPage,
    useUpdateAccount: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useSetPriority: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}))

describe("AccountDetailPage", () => {
  it("shows the account name in the toolbar, the monthly quota and today's real usage", () => {
    render(
      <MemoryRouter initialEntries={["/accounts/1"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/accounts/:id" element={<AccountDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole("heading", { name: "主账号", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument()
    expect(screen.getByText("账号余额")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "本月额度已用 10%" })).toBeInTheDocument()
    expect(screen.getByText("86")).toBeInTheDocument()
    expect(screen.getByText("$7.42")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "用量" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "限流日志" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "失败日志" })).toBeInTheDocument()
  })
})
