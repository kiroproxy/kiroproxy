import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { shiftDays } from "@/lib/format"
import type { UsageFilter, UsageRecordItem } from "@/lib/types"
import { UsagePage } from "./usage"

const mocks = vi.hoisted(() => ({
  records: vi.fn(),
  total: 1,
}))

const record: UsageRecordItem = {
  model: "claude-sonnet-4.5",
  inputTokens: 1200,
  outputTokens: 300,
  estimatedCost: 0.02,
  createdAt: "2026-10-22T10:00:00Z",
  credentialLabel: "主账号",
  firstTokenMs: 850,
  isStream: true,
  clientIp: "127.0.0.1",
}

vi.mock("@/lib/queries", () => ({
  useDailyUsage: () => ({
    data: [0, -1, -2].map((offset) => ({
      date: shiftDays(offset),
      totalRequests: 10 + offset,
      totalCost: 0,
      totalCredits: 0,
      totalCreditsSaved: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
    })),
    isLoading: false,
  }),
  useUsageBreakdown: () => ({ data: { byModel: [], byDayModel: [] }, isLoading: false, isError: false }),
  useUsageRecords: (filter: UsageFilter) => {
    mocks.records(filter)
    return {
      data: { records: [record], total: mocks.total, page: 1, pageSize: 50, totalPages: 1 },
      isLoading: false,
      isError: false,
      isFetching: false,
    }
  },
}))

beforeEach(() => {
  window.sessionStorage.clear()
  mocks.records.mockClear()
  mocks.total = 1
})

describe("UsagePage", () => {
  it("remembers the chosen range when coming back to the page", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<UsagePage />)
    await user.click(screen.getByRole("button", { name: "30 天" }))
    unmount()

    render(<UsagePage />)
    expect(screen.getByRole("button", { name: "30 天" })).toHaveAttribute("aria-pressed", "true")
  })

  it("drills the records down to a single day", async () => {
    const user = userEvent.setup()
    render(<UsagePage />)
    const yesterday = shiftDays(-1)

    await user.click(screen.getByRole("combobox", { name: "按日期筛选记录" }))
    await user.click(await screen.findByRole("option", { name: new RegExp(yesterday.slice(5)) }))

    expect(mocks.records).toHaveBeenLastCalledWith(expect.objectContaining({ from: yesterday, to: yesterday }))
  })

  it("says when the records list is capped", () => {
    mocks.total = 10_000
    render(<UsagePage />)
    expect(screen.getByText(/只列出最新的 10,000 条记录/)).toBeInTheDocument()
  })

  it("expands a record to show the fields the table leaves out", async () => {
    const user = userEvent.setup()
    render(<UsagePage />)

    const toggle = screen.getByRole("button", { expanded: false, name: /2026/ })
    await user.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("首字耗时").nextSibling).toHaveTextContent("850 ms")
    expect(screen.getByText("客户端 IP").nextSibling).toHaveTextContent("127.0.0.1")
  })
})
