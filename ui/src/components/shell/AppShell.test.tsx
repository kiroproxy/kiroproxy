import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { AppShell } from "./AppShell"

it("renders title, nav and status bar", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <AppShell title="概览" subtitle="今天的代理状态">
        <div>content</div>
      </AppShell>
    </MemoryRouter>,
  )
  expect(screen.getByRole("heading", { name: "概览" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "账号" })).toBeInTheDocument()
  expect(screen.getByText("代理运行中")).toBeInTheDocument()
})
