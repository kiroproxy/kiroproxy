import { describe, expect, it } from "vitest"
import { fmtCost, fmtDuration, fmtNumber } from "./format"

describe("format", () => {
  it("formats numbers with grouping", () => expect(fmtNumber(1234567)).toBe("1,234,567"))
  it("formats cost with two decimals", () => expect(fmtCost(1.5)).toBe("$1.50"))
  it("formats duration", () => expect(fmtDuration(65)).toBe("1 分 5 秒"))
})
