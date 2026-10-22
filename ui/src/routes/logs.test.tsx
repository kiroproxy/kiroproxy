import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { LogEntry } from "@/lib/types"
import { LogsPage } from "./logs"

const mocks = vi.hoisted(() => ({ entries: [] as LogEntry[] }))

vi.mock("@/lib/log-stream", () => ({
  useLogStream: () => ({ entries: mocks.entries, clear: vi.fn() }),
}))

vi.mock("@/lib/queries", () => {
  const emptyPage = { data: { records: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }, isLoading: false }
  return {
    useAccounts: () => ({ data: { total: 0, available: 0, currentId: 0, credentials: [] } }),
    useThrottleLogs: () => emptyPage,
    useFailureLogs: () => emptyPage,
  }
})

const entry = (seq: number, level: string, message: string): LogEntry => ({
  seq,
  level,
  message,
  target: "kiro_core::kiro::provider",
  timestamp: "2026-10-22T10:00:00.000Z",
})

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  mocks.entries = [
    entry(1, "ERROR", "上游返回 500"),
    entry(2, "WARN", "账号 #2 被限流"),
    entry(3, "INFO", "请求完成"),
    entry(4, "DEBUG", "请求体 1024 字节"),
  ]
})

it("labels the destructive clear action for what it does", async () => {
  const user = userEvent.setup()
  render(<LogsPage />)

  // 按钮会清空内存缓冲区和日志文件，文案不能叫「清空视图」。
  expect(screen.queryByRole("button", { name: "清空视图" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "清空日志" }))

  expect(await screen.findByRole("alertdialog")).toHaveTextContent("内存缓冲区与日志文件都会被清空")
})

it("filters by minimum level so errors stay visible when showing warnings", async () => {
  const user = userEvent.setup()
  render(<LogsPage />)

  await user.click(screen.getByRole("button", { name: "WARN 及以上" }))
  expect(screen.getByText("显示 2 / 4 条")).toBeInTheDocument()

  await user.click(screen.getByRole("button", { name: "INFO 及以上" }))
  expect(screen.getByText("显示 3 / 4 条")).toBeInTheDocument()
})

it("opens the full message of a log line with a copy action", async () => {
  // jsdom 没有布局；给日志滚动区一个尺寸，虚拟列表才会渲染行。
  const sized = (size: number) =>
    function (this: Element) {
      return this.getAttribute("role") === "log" ? size : 0
    }
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(sized(400))
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(sized(800))
  const user = userEvent.setup()
  render(<LogsPage />)

  await user.click(screen.getByRole("button", { name: /账号 #2 被限流/ }))
  const detail = screen.getByRole("region", { name: "日志详情" })
  expect(detail).toHaveTextContent("kiro_core::kiro::provider")

  await user.click(within(detail).getByRole("button", { name: "复制" }))
  expect(await navigator.clipboard.readText()).toContain("WARN kiro_core::kiro::provider 账号 #2 被限流")
})

it("freezes the list while the user reads older lines", () => {
  // 模拟一个已经往上翻过的日志区：内容 2000px、视口 400px、停在 100px 处。
  const onLog = (value: number) =>
    function (this: Element) {
      return this.getAttribute("role") === "log" ? value : 0
    }
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(onLog(400))
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(onLog(2000))
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(onLog(100))
  const { rerender } = render(<LogsPage />)

  fireEvent.scroll(screen.getByRole("log"))
  expect(screen.getByRole("button", { name: "继续" })).toBeInTheDocument()

  // 新日志在后台继续累积，但正在看的列表不动。
  mocks.entries = [...mocks.entries, entry(5, "INFO", "新的请求")]
  rerender(<LogsPage />)
  expect(screen.getByText("显示 4 / 4 条")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /已暂停 · 1 条新日志/ })).toBeInTheDocument()
})

it("keeps the runtime filter when switching tabs and back", async () => {
  const user = userEvent.setup()
  render(<LogsPage />)

  await user.click(screen.getByRole("button", { name: "WARN 及以上" }))
  await user.click(screen.getByRole("tab", { name: "限流日志" }))
  await user.click(screen.getByRole("tab", { name: "运行日志" }))

  expect(screen.getByText("显示 2 / 4 条")).toBeInTheDocument()
})
