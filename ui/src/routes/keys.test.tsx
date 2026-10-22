import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
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

function renderKeys() {
  render(
    <MemoryRouter>
      <KeysPage />
    </MemoryRouter>,
  )
}

it("starts every new key from an empty form", async () => {
  mocks.create.mockImplementation((_req: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.())
  const user = userEvent.setup()
  renderKeys()

  await user.click(screen.getByRole("button", { name: "创建密钥" }))
  await user.type(await screen.findByLabelText("名称"), "CI 密钥")
  await user.click(screen.getByRole("button", { name: "保存" }))
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "CI 密钥" }), expect.anything())

  // 第二次创建不能带出上一次填写的内容。
  await user.click(screen.getByRole("button", { name: "创建密钥" }))
  expect(await screen.findByLabelText("名称")).toHaveValue("")
})

it("validates the key form inline before saving", async () => {
  mocks.create.mockReset()
  const user = userEvent.setup()
  renderKeys()

  await user.click(screen.getByRole("button", { name: "创建密钥" }))
  await user.type(await screen.findByLabelText("额度值"), "-5")
  // 格式错误边输入边提示。
  expect(screen.getByText("额度需要是不小于 0 的数字")).toBeInTheDocument()

  await user.click(screen.getByRole("button", { name: "保存" }))
  expect(screen.getByText("名称不能为空")).toBeInTheDocument()
  expect(screen.getByLabelText("名称")).toHaveAttribute("aria-invalid", "true")
  expect(mocks.create).not.toHaveBeenCalled()
})
