import { act, render, screen } from "@testing-library/react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table"

/** 记录回调的 ResizeObserver 替身，测试里手动触发尺寸变化。 */
class FakeResizeObserver {
  static latest: FakeResizeObserver | undefined
  private readonly callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.latest = this
  }
  observe() {}
  disconnect() {}
  trigger() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

const widths = { container: 800, table: 800 }

function renderTable() {
  render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>账号</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>主账号</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  )
  return screen.getByRole("table").parentElement as HTMLElement
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
    return this.getAttribute("data-slot") === "table-container" ? widths.container : 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.tagName === "TABLE" ? widths.table : 0
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Table", () => {
  it("pins header cells and only scrolls horizontally when the table is wider than its container", () => {
    widths.table = 800
    const container = renderTable()

    expect(screen.getByRole("columnheader", { name: "账号" })).toHaveClass("sticky", "top-0")
    // 不横向滚动时容器不是滚动容器，表头才能吸附到外层滚动区的顶部。
    expect(container).not.toHaveClass("overflow-x-auto")

    widths.table = 1200
    act(() => FakeResizeObserver.latest?.trigger())
    expect(container).toHaveClass("overflow-x-auto")

    widths.table = 800
    act(() => FakeResizeObserver.latest?.trigger())
    expect(container).not.toHaveClass("overflow-x-auto")
  })
})
