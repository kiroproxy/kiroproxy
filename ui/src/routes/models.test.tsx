import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ModelsPage } from "./models"

vi.mock("@/lib/queries", () => ({
  useModels: () => ({
    data: [
      { id: "claude-sonnet-4.5", displayName: "Claude Sonnet 4.5", type: "model", ownedBy: "anthropic", maxTokens: 0 },
      { id: "gpt-5.6-sol", displayName: "GPT 5.6 Sol", type: "model", ownedBy: "openai", maxTokens: 0 },
    ],
    isLoading: false,
    isError: false,
  }),
  useAccounts: () => ({ data: { total: 0, available: 0, currentId: 0, credentials: [] } }),
  useAccountModels: () => ({ data: undefined, isFetching: false, isError: false }),
}))

describe("ModelsPage", () => {
  it("copies a model id with one click", async () => {
    const user = userEvent.setup()
    render(<ModelsPage />)

    await user.click(screen.getByRole("button", { name: "复制模型 ID gpt-5.6-sol" }))
    expect(await navigator.clipboard.readText()).toBe("gpt-5.6-sol")
  })

  it("puts account probing in its own tab instead of below the model list", async () => {
    const user = userEvent.setup()
    render(<ModelsPage />)

    await user.click(screen.getByRole("tab", { name: "账号探测" }))
    expect(screen.getByRole("combobox", { name: "选择账号" })).toBeInTheDocument()
  })
})
