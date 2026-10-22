import { act, render, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"
import { useLoginFormPresence, useOauthNotifications } from "./oauth-notifications"

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(name, handler)
    return () => mocks.listeners.delete(name)
  },
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function Notifications() {
  useOauthNotifications()
  return null
}

function LoginForm() {
  useLoginFormPresence()
  return null
}

async function renderNotifications(withForm = false) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, "invalidateQueries")
  render(
    <QueryClientProvider client={client}>
      <Notifications />
      {withForm ? <LoginForm /> : null}
    </QueryClientProvider>,
  )
  await waitFor(() => expect(mocks.listeners.has("oauth://status")).toBe(true))
  const emit = (payload: unknown) => act(() => mocks.listeners.get("oauth://status")?.({ payload }))
  return { emit, invalidate }
}

beforeEach(() => {
  mocks.listeners.clear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe("useOauthNotifications", () => {
  it("announces a login that finishes after the dialog was closed and refreshes accounts", async () => {
    const { emit, invalidate } = await renderNotifications()
    emit({ phase: "success", message: "账号已添加：主账号" })

    expect(toast.success).toHaveBeenCalledWith("账号已添加：主账号")
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] })
  })

  it("only toasts failures when no login form is showing them", async () => {
    const { emit } = await renderNotifications(true)
    emit({ phase: "failed", message: "授权被拒绝" })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("toasts failures when the dialog is closed", async () => {
    const { emit } = await renderNotifications()
    emit({ phase: "failed", message: "授权被拒绝" })
    expect(toast.error).toHaveBeenCalledWith("授权被拒绝")
  })
})
