import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { KeysPage } from "./keys"

const mocks = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("@/lib/queries", () => ({
  useApiKeys: () => ({ data: [], isLoading: false, isError: false }),
  useAllApiKeyUsage: () => ({ data: [] }),
  useAccounts: () => ({ data: { total: 0, available: 0, currentId: 0, credentials: [] } }),
  useCreateApiKey: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateApiKey: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteApiKey: () => ({ mutate: vi.fn(), isPending: false }),
  useResetApiKeyUsage: () => ({ mutate: vi.fn(), isPending: false }),
}))

it("starts every new key from an empty form", async () => {
  mocks.create.mockImplementation((_req: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.())
  const user = userEvent.setup()
  render(<KeysPage />)

  await user.click(screen.getByRole("button", { name: "创建密钥" }))
  await user.type(await screen.findByLabelText("名称"), "CI 密钥")
  await user.click(screen.getByRole("button", { name: "保存" }))
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "CI 密钥" }), expect.anything())

  // 第二次创建不能带出上一次填写的内容。
  await user.click(screen.getByRole("button", { name: "创建密钥" }))
  expect(await screen.findByLabelText("名称")).toHaveValue("")
})
