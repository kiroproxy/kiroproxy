import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConnectPage } from "./connect"

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }))

vi.mock("@/lib/queries", () => ({
  useServerStatus: () => ({
    data: { running: true, host: "127.0.0.1", port: 5678, baseUrl: "http://127.0.0.1:5678" },
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
  }),
  useModels: () => ({
    data: [
      { id: "claude-sonnet-4.5", displayName: "Claude Sonnet 4.5", type: "model", ownedBy: "anthropic", maxTokens: 0 },
      { id: "gpt-5.6-sol", displayName: "GPT 5.6 Sol", type: "model", ownedBy: "openai", maxTokens: 0 },
    ],
  }),
}))

/** 找到某个代码片段所在的块（标签 + 复制按钮 + 代码）。 */
function block(label: string) {
  return within(screen.getByText(label).parentElement!.parentElement!)
}

beforeEach(() => {
  mocks.invoke.mockReset()
  mocks.invoke.mockImplementation(async (command: string) =>
    command === "get_api_key_secret" ? "sk-kp-real-secret" : null,
  )
})

describe("ConnectPage", () => {
  it("shows the masked key but copies the real one", async () => {
    const user = userEvent.setup()
    render(<ConnectPage />)

    const env = block("环境变量")
    expect(env.getByText(/sk-kp-a3f9••••c21e/)).toBeInTheDocument()

    await user.click(env.getByRole("button", { name: "复制" }))
    expect(await navigator.clipboard.readText()).toContain('ANTHROPIC_API_KEY="sk-kp-real-secret"')
    expect(mocks.invoke).toHaveBeenCalledWith("get_api_key_secret", { id: 1 })
    // 复制不改变页面上的显示。
    expect(env.queryByText(/sk-kp-real-secret/)).not.toBeInTheDocument()
  })

  it("fills Codex snippets with a model picked from the upstream list", async () => {
    const user = userEvent.setup()
    render(<ConnectPage />)

    await user.click(screen.getByRole("tab", { name: "Codex CLI" }))
    // 默认优先 GPT 系模型，不再写死。
    expect(block("~/.codex/config.toml").getByText(/model = "gpt-5.6-sol"/)).toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "模型" }))
    await user.click(await screen.findByRole("option", { name: "claude-sonnet-4.5" }))
    expect(block("~/.codex/config.toml").getByText(/model = "claude-sonnet-4.5"/)).toBeInTheDocument()
  })
})
