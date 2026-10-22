import { describe, expect, it } from "vitest"
import { dateRange, fmtCompact, fmtCost, fmtDuration, fmtLogTime, fmtNumber, shiftDays } from "./format"

describe("format", () => {
  it("formats numbers with grouping", () => expect(fmtNumber(1234567)).toBe("1,234,567"))
  it("formats cost with two decimals", () => expect(fmtCost(1.5)).toBe("$1.50"))
  it("formats duration", () => expect(fmtDuration(65)).toBe("1 分 5 秒"))
  it("formats compact axis values", () => {
    expect(fmtCompact(2_400_000)).toBe("240万")
    expect(fmtCompact(0)).toBe("0")
  })

  it("formats log timestamps in local time", () => {
    const iso = "2026-10-22T10:00:01.234Z"
    const local = new Date(iso)
    const expected = `${String(local.getHours()).padStart(2, "0")}:00:01.234`
    expect(fmtLogTime(iso)).toBe(expected)
  })

  it("lists inclusive date ranges across month boundaries", () => {
    expect(dateRange("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ])
  })

  it("shifts days from a base date", () => {
    expect(shiftDays(-1, new Date(2026, 9, 1))).toBe("2026-09-30")
  })
})
