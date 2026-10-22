import { dateRange, shiftDays } from "./format"
import type { DailySummary } from "./types"

export interface TrendPoint {
  /** `MM-DD` */
  date: string
  /** 没有记录的日期为 null，图上留空而不是画成 0。 */
  input: number | null
  cache: number | null
}

/** 最近 7 天（含今天），按日期升序；后端按日期降序返回，且没有记录的日期不会出现。 */
export function lastSevenDays(daily: DailySummary[], today = new Date()): TrendPoint[] {
  const byDate = new Map(daily.map((day) => [day.date, day]))
  return dateRange(shiftDays(-6, today), shiftDays(0, today)).map((date) => {
    const day = byDate.get(date)
    return {
      date: date.slice(5),
      input: day ? day.totalInputTokens : null,
      cache: day ? day.totalCacheReadTokens : null,
    }
  })
}

/** 图表分类色：按用量排名分配，同一视图里的图例、柱子和排行条颜色一致；第 5 名起归入「其他」。 */
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"]
export const OTHER_COLOR = "var(--chart-other)"

export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? OTHER_COLOR
}
