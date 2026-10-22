import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"
import type { OauthStatus } from "@/lib/types"
import { AddAccountDialog } from "./AddAccountDialog"

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

vi.mock("@/lib/queries", () => ({
  queryKeys: { accounts: ["accounts"] },
  useCreateAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useImportKam: () => ({ mutate: vi.fn(), isPending: false }),
  useImportKiroIde: () => ({ mutate: vi.fn(), isPending: false }),
}))

/** 让后端的 get_oauth_status 返回指定状态。 */
function backendStatus(status: OauthStatus) {
  mocks.invoke.mockImplementation(async (command: string) =>
    command === "get_oauth_status" ? status : null,
  )
}

function renderDialog(tab: "oauth" | "kam") {
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddAccountDialog open tab={tab} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  )
  return onOpenChange
}

async function renderOauthTab() {
  const onOpenChange = renderDialog("oauth")
  // 等初始状态读取完、事件监听挂好，再做断言。
  await waitFor(() => expect(mocks.listeners.has("oauth://status")).toBe(true))
  await act(async () => {})
  return onOpenChange
}

beforeEach(() => {
  mocks.invoke.mockReset()
  mocks.listeners.clear()
  vi.mocked(toast.success).mockClear()
})

describe("AddAccountDialog browser login", () => {
  it("ignores the result of an earlier login when the dialog is reopened", async () => {
    backendStatus({ phase: "success", message: "账号已添加", credentialId: 7 })
    const onOpenChange = await renderOauthTab()

    expect(screen.getByRole("button", { name: "打开 Kiro 登录页" })).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("restores a pending login and closes once it succeeds", async () => {
    backendStatus({ phase: "waiting", verificationUrl: "https://app.kiro.dev/signin" })
    const onOpenChange = await renderOauthTab()
    expect(screen.getByText(/请在浏览器中完成登录/)).toBeInTheDocument()

    act(() => {
      mocks.listeners.get("oauth://status")?.({
        payload: { phase: "success", message: "账号已添加：主账号", credentialId: 8 },
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toast.success).toHaveBeenCalledWith("账号已添加：主账号")
  })
})

describe("AddAccountDialog KAM import", () => {
  it("keeps a long preview inside its own scroll area so the import button stays visible", async () => {
    const accounts = Array.from({ length: 40 }, (_, index) => ({
      email: `user${index}@example.com`,
      nickname: null,
      provider: "Google",
      authMethod: "social",
      authRegion: null,
      hasClientId: false,
      hasClientSecret: false,
      maskedToken: `aor••••${index}`,
    }))
    mocks.invoke.mockImplementation(async (command: string) =>
      command === "preview_kam_import" ? { accounts, duplicatesInFile: 0, invalid: 0 } : null,
    )
    const user = userEvent.setup()
    renderDialog("kam")

    await user.click(screen.getByRole("textbox", { name: "KAM 导入" }))
    await user.paste('[{"refreshToken":"aor-token"}]')
    await user.click(screen.getByRole("button", { name: "预览" }))

    const scroller = (await screen.findByRole("table")).closest(".overflow-y-auto")
    expect(scroller).toHaveClass("max-h-[240px]")
    expect(scroller).not.toContainElement(screen.getByRole("button", { name: "导入" }))
  })
})
