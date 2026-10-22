import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { VerifyOutcome } from "@/lib/types"
import { BatchVerifyDialog } from "./BatchVerifyDialog"

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}))

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }))
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(name, handler)
    return () => mocks.listeners.delete(name)
  },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const account = (id: number, nickname: string) => ({
  id,
  nickname,
  priority: id,
  disabled: false,
  failureCount: 0,
  isCurrent: false,
  hasProfileArn: true,
  successCount: 0,
  hasProxy: false,
  thinkingAdaptive: false,
  healthStatus: "healthy",
  throttleCount: 0,
})

/** 可以在测试里手动结束的验活请求。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function rowOf(name: string) {
  return within(screen.getByText(name).closest("li") as HTMLElement)
}

it("shows per-account progress while verifying", async () => {
  const pending = deferred<VerifyOutcome>()
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "list_accounts") {
      return { total: 2, available: 2, currentId: 1, credentials: [account(1, "主账号"), account(2, "备用账号")] }
    }
    if (command === "verify_accounts") return pending.promise
    return null
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BatchVerifyDialog ids={[1, 2]} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  )
  await waitFor(() => expect(mocks.listeners.has("accounts://verify-progress")).toBe(true))

  await user.click(screen.getByRole("button", { name: "开始验活" }))
  expect(await screen.findByText("已验证 0/2 · 约剩 2 秒")).toBeInTheDocument()
  expect(rowOf("主账号").getByText("验证中")).toBeInTheDocument()
  expect(rowOf("备用账号").getByText("等待中")).toBeInTheDocument()

  act(() => {
    mocks.listeners.get("accounts://verify-progress")?.({
      payload: { current: 1, total: 2, id: 1, status: "success", message: "120/1000" },
    })
  })
  expect(screen.getByText("已验证 1/2")).toBeInTheDocument()
  expect(rowOf("主账号").getByText("成功")).toBeInTheDocument()
  expect(rowOf("备用账号").getByText("验证中")).toBeInTheDocument()

  // 取消后后端停在当前账号，返回已完成部分；没轮到的账号显示「未验证」。
  await user.click(screen.getByRole("button", { name: "取消" }))
  expect(mocks.invoke).toHaveBeenCalledWith("cancel_verify_accounts", undefined)
  await act(async () => {
    pending.resolve({ success: 1, failed: 0, results: [{ id: 1, status: "success", message: "120/1000" }] })
  })
  expect(await screen.findByText("1 成功 · 0 失败")).toBeInTheDocument()
  expect(rowOf("备用账号").getByText("未验证")).toBeInTheDocument()
})
