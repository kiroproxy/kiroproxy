import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ServerStatus, SettingsView } from "@/lib/types"
import { hasUnsavedChanges } from "@/lib/unsaved-changes"
import { ServiceSection } from "./ServiceSection"

const mocks = vi.hoisted(() => ({
  server: undefined as ServerStatus | undefined,
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock("@/lib/queries", () => ({
  useServerStatus: () => ({ data: mocks.server }),
  useUpdateRuntimeConfig: () => ({ mutate: vi.fn(), isPending: false }),
  useStartProxy: () => ({ mutate: mocks.start, isPending: false }),
  useStopProxy: () => ({ mutate: mocks.stop, isPending: false }),
  useRestartProxy: () => ({ mutate: vi.fn(), isPending: false }),
}))

const settings = { host: "127.0.0.1", port: 5678 } as SettingsView
const running: ServerStatus = { running: true, host: "127.0.0.1", port: 5678, baseUrl: "http://127.0.0.1:5678" }

beforeEach(() => {
  mocks.start.mockReset()
  mocks.stop.mockReset()
})

describe("ServiceSection", () => {
  it("offers to start a stopped proxy in place", async () => {
    mocks.server = { ...running, running: false }
    const user = userEvent.setup()
    render(<ServiceSection data={settings} />)

    await user.click(screen.getByRole("button", { name: "启动" }))
    expect(mocks.start).toHaveBeenCalledTimes(1)
  })

  it("asks before stopping a running proxy", async () => {
    mocks.server = running
    const user = userEvent.setup()
    render(<ServiceSection data={settings} />)

    await user.click(screen.getByRole("button", { name: "停止" }))
    expect(mocks.stop).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "停止" }))
    expect(mocks.stop).toHaveBeenCalledTimes(1)
  })

  it("registers unsaved edits so leaving the section can be confirmed", async () => {
    mocks.server = running
    const user = userEvent.setup()
    const { unmount } = render(<ServiceSection data={settings} />)

    await user.type(screen.getByLabelText("端口"), "0")
    expect(hasUnsavedChanges()).toBe(true)
    unmount()
    expect(hasUnsavedChanges()).toBe(false)
  })
})
