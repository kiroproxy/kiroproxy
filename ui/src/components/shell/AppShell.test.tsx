import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { AppShell } from "./AppShell"

vi.mock("@/lib/queries", () => ({
  useServerStatus: () => ({
    data: { running: true, host: "127.0.0.1", port: 5678, baseUrl: "http://127.0.0.1:5678" },
  }),
  useAccounts: () => ({ data: { total: 0, available: 0, currentId: 0, credentials: [] } }),
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
