import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LeaveGuardDialog } from "@/components/shell/LeaveGuardDialog"
import { hasUnsavedChanges, requestLeave, setUnsaved } from "./unsaved-changes"

afterEach(() => setUnsaved("form", false))

describe("unsaved changes guard", () => {
  it("leaves right away when nothing is pending", () => {
    const leave = vi.fn()
    requestLeave(leave)
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it("asks before discarding edits and only leaves after confirming", async () => {
    const user = userEvent.setup()
    render(<LeaveGuardDialog />)
    const leave = vi.fn()

    act(() => {
      setUnsaved("form", true)
      requestLeave(leave)
    })
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("离开后这些修改会丢失")

    await user.click(screen.getByRole("button", { name: "继续编辑" }))
    expect(leave).not.toHaveBeenCalled()
    expect(hasUnsavedChanges()).toBe(true)

    act(() => requestLeave(leave))
    await user.click(await screen.findByRole("button", { name: "放弃修改" }))
    expect(leave).toHaveBeenCalledTimes(1)
    expect(hasUnsavedChanges()).toBe(false)
  })
})
