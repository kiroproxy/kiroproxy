import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { SettingsPage } from "./settings"

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }))

vi.mock("@/lib/queries", () => ({
  useSettings: () => ({ data: { version: "0.1.1" }, isError: false }),
  useRestartProxy: () => ({ mutate: vi.fn(), isPending: false }),
}))

it("opens the project and upstream links from About", async () => {
  mocks.invoke.mockResolvedValue(null)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={["/settings/about"]}>
      <Routes>
        <Route path="/settings/:section" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )

  await user.click(screen.getByRole("button", { name: "github.com/kiroproxy/kiroproxy" }))
  expect(mocks.invoke).toHaveBeenCalledWith("open_link", { kind: "project" })

  await user.click(screen.getByRole("button", { name: "TsinHzl/kiro2cc-proxy" }))
  expect(mocks.invoke).toHaveBeenCalledWith("open_link", { kind: "kiro2cc" })
})
