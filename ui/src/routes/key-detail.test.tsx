import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/shell/AppShell"
import { KeyDetailPage } from "./key-detail"

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }))

vi.mock("@/lib/queries", () => {
  const key = {
    id: 3,
    name: "CI 密钥",
    maskedKey: "sk-kp-c1••••9f2a",
    enabled: true,
    createdAt: "2026-10-01T08:00:00Z",
    limitUnit: "usd",
    spendingLimit: 10,
    usedAmount: 2.5,
    durationDays: 30,
    activatedAt: null,
    boundCredentialIds: [1],
  }
  const mutation = { mutate: vi.fn(), isPending: false }
  return {
    useApiKeys: () => ({ data: [key], isLoading: false, isError: false }),
    useApiKeyUsage: () => ({
      data: {
        apiKeyId: 3,
        totalRequests: 42,
        totalInputTokens: 1000,
        totalOutputTokens: 200,
        totalCost: 2.5,
        totalCredits: 8,
        totalCreditsSaved: 0,
        byModel: [],
      },
      isLoading: false,
      isError: false,
    }),
    useApiKeyUsageRecords: () => ({
      data: { records: [], total: 0, page: 1, pageSize: 50, totalPages: 0 },
      isLoading: false,
      isError: false,
    }),
    useAccounts: () => ({
      data: { total: 1, available: 1, currentId: 1, credentials: [{ id: 1, nickname: "主账号" }] },
    }),
    useServerStatus: () => ({ data: { running: true, host: "127.0.0.1", port: 5678, baseUrl: "" } }),
    useRpm: () => ({ data: { global: 0, byCredential: {}, byApiKey: {} } }),
    useAppInfo: () => ({ data: { version: "0.1.1" } }),
    useCreateApiKey: () => mutation,
    useUpdateApiKey: () => mutation,
    useDeleteApiKey: () => mutation,
    useResetApiKeyUsage: () => mutation,
  }
})

function renderDetail() {
  render(
    <MemoryRouter initialEntries={["/keys/3"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/keys/:id" element={<KeyDetailPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe("KeyDetailPage", () => {
  it("shows the key, its quota, binding, validity and usage summary", () => {
    renderDetail()

    expect(screen.getByRole("heading", { name: "CI 密钥", level: 1 })).toBeInTheDocument()
    expect(screen.getByText("sk-kp-c1••••9f2a")).toBeInTheDocument()
    expect(screen.getByText("$2.50 / $10.00")).toBeInTheDocument()
    expect(screen.getByText("主账号")).toBeInTheDocument()
    expect(screen.getByText("首次使用后 30 天内有效")).toBeInTheDocument()
    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.getByText("这个密钥还没有调用记录")).toBeInTheDocument()
  })

  it("copies the real secret without revealing it", async () => {
    mocks.invoke.mockImplementation(async (command: string) =>
      command === "get_api_key_secret" ? "sk-kp-real-secret" : null,
    )
    const user = userEvent.setup()
    renderDetail()

    await user.click(screen.getByRole("button", { name: "复制" }))
    expect(await navigator.clipboard.readText()).toBe("sk-kp-real-secret")
    expect(screen.queryByText("sk-kp-real-secret")).not.toBeInTheDocument()
  })
})
