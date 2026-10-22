import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { setUnsaved } from "@/lib/unsaved-changes"
import { AppShell } from "./AppShell"

vi.mock("@/lib/queries", () => ({
  useServerStatus: () => ({
    data: { running: true, host: "127.0.0.1", port: 5678, baseUrl: "http://127.0.0.1:5678" },
  }),
  useAccounts: () => ({
    data: {
      total: 1,
      available: 1,
      currentId: 1,
      credentials: [{ id: 7, nickname: "备用账号", email: "backup@example.com", priority: 0 }],
    },
  }),
  useApiKeys: () => ({ data: [] }),
  useRpm: () => ({ data: { global: 0, byCredential: {}, byApiKey: {} } }),
  useAppInfo: () => ({ data: { version: "0.1.0" } }),
}))

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <div>content</div>
      </AppShell>
    </MemoryRouter>,
  )
}

// 弹窗打开时页面其余部分对读屏器隐藏，所以查标题时带上 hidden。
const pageTitle = () => screen.getByRole("heading", { level: 1, hidden: true })

afterEach(() => setUnsaved("test", false))

it("renders title, nav and status bar", () => {
  renderShell("/")
  expect(screen.getByRole("heading", { name: "概览", level: 1 })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "账号" })).toBeInTheDocument()
  expect(screen.getByText("代理运行中")).toBeInTheDocument()
  expect(screen.getByText("v0.1.0")).toBeInTheDocument()
})

it("uses the settings section name as the toolbar title", () => {
  renderShell("/settings/network")
  expect(screen.getByRole("heading", { name: "网络与代理", level: 1 })).toBeInTheDocument()
  expect(screen.getByText("修改即时生效")).toBeInTheDocument()
})

it("switches pages with cmd+number and opens settings with cmd+comma", async () => {
  const user = userEvent.setup()
  renderShell("/")

  await user.keyboard("{Meta>}2{/Meta}")
  expect(pageTitle()).toHaveTextContent("账号")
  await user.keyboard("{Meta>},{/Meta}")
  expect(pageTitle()).toHaveTextContent("服务")
})

it("asks before a shortcut leaves a settings section with unsaved edits", async () => {
  const user = userEvent.setup()
  renderShell("/settings/service")
  act(() => setUnsaved("test", true))

  await user.keyboard("{Meta>}1{/Meta}")
  expect(await screen.findByRole("alertdialog")).toHaveTextContent("放弃未保存的修改？")
  expect(pageTitle()).toHaveTextContent("服务")
  expect(screen.getByText("有未保存的修改")).toBeInTheDocument()
})

it("opens the command palette with cmd+k and jumps to a page or an account", async () => {
  const user = userEvent.setup()
  renderShell("/")

  await user.keyboard("{Meta>}k{/Meta}")
  const input = await screen.findByRole("combobox", { name: "命令面板" })
  await user.type(input, "密钥")
  await user.keyboard("{Enter}")
  await waitFor(() => expect(pageTitle()).toHaveTextContent("密钥"))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

  await user.keyboard("{Meta>}k{/Meta}")
  await user.type(await screen.findByRole("combobox", { name: "命令面板" }), "backup")
  await user.click(screen.getByRole("option", { name: "备用账号" }))
  await waitFor(() => expect(pageTitle()).toHaveTextContent("账号详情"))
})
