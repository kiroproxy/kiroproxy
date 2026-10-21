import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
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
  return {
    queryKeys: {
      accounts: ["accounts"],
      accountModels: (id: number) => ["accountModels", id],
    },
    useAccounts: () => ({
      data: { total: 1, available: 1, currentId: 1, credentials: [account] },
      isLoading: false,
    }),
    useAccountBalance: () => ({
      data: {
        id: 1,
        currentUsage: 10,
        usageLimit: 100,
        remaining: 90,
        usagePercentage: 10,
      },
      isLoading: false,
    }),
    useAccountModels: () => ({ data: [], isLoading: false }),
    useCredentialTodaySummary: () => ({ data: undefined, isLoading: false }),
    useCredentialUsageRecords: () => ({
      data: { records: [], total: 0, page: 1, pageSize: 50, totalPages: 1 },
      isLoading: false,
    }),
    useThrottleLogs: () => ({
      data: { records: [], total: 0, page: 1, pageSize: 50, totalPages: 1 },
      isLoading: false,
    }),
    useFailureLogs: () => ({
      data: { records: [], total: 0, page: 1, pageSize: 50, totalPages: 1 },
      isLoading: false,
    }),
    useUpdateAccount: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

describe("AccountDetailPage", () => {
  it("renders the account, quota card and tabs", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/accounts/1"]}>
          <Routes>
            <Route path="/accounts/:id" element={<AccountDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByText("主账号")).toBeInTheDocument()
    expect(screen.getByText("账号余额")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "用量" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "限流日志" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "失败日志" })).toBeInTheDocument()
  })
})
