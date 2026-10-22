import { render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogTitle } from "./dialog"

it("keeps tall dialogs inside the window and scrolls their content", () => {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>标题</DialogTitle>
      </DialogContent>
    </Dialog>,
  )
  // jsdom 不做布局，只能锁住约束本身：最大高度跟随窗口，超出部分在弹窗内滚动。
  expect(screen.getByRole("dialog")).toHaveClass("max-h-[calc(100%-2rem)]", "overflow-y-auto")
})
