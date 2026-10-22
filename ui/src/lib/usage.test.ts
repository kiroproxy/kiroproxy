import { expect, it } from "vitest"
import type { DailySummary } from "./types"
import { lastSevenDays } from "./usage"

function day(date: string, input: number): DailySummary {
  return {
    date,
    totalRequests: 1,
    totalCost: 0,
    totalCredits: 0,
    totalCreditsSaved: 0,
    totalInputTokens: input,
    totalOutputTokens: 0,
    totalCacheReadTokens: input * 2,
  }
}

it("takes the latest seven days in ascending order even though the backend sorts descending", () => {
  // 后端 get_daily_summaries 按日期降序返回。
  const daily = [
    day("2026-10-22", 22),
    day("2026-10-21", 21),
    day("2026-10-18", 18),
    day("2026-10-10", 10),
    day("2026-10-01", 1),
  ]
  const points = lastSevenDays(daily, new Date(2026, 9, 22))
  expect(points.map((point) => point.date)).toEqual([
    "10-16",
    "10-17",
    "10-18",
    "10-19",
    "10-20",
    "10-21",
    "10-22",
  ])
  expect(points.map((point) => point.input)).toEqual([null, null, 18, null, null, 21, 22])
  expect(points[6].cache).toBe(44)
})
