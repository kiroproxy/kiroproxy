import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LogsPage } from "./logs"

it("labels the destructive clear action for what it does", async () => {
  const user = userEvent.setup()
  render(<LogsPage />)

  // 按钮会清空内存缓冲区和日志文件，文案不能叫「清空视图」。
  expect(screen.queryByRole("button", { name: "清空视图" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "清空日志" }))

  expect(await screen.findByRole("alertdialog")).toHaveTextContent("内存缓冲区与日志文件都会被清空")
})
