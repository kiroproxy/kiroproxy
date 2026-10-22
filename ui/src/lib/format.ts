import { strings } from "./strings"

const numberFormat = new Intl.NumberFormat("en-US")
const compactFormat = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const creditsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

export const fmtNumber = (n: number) => numberFormat.format(n)
/** 图表坐标轴等空间有限处使用的紧凑格式：2400000 → 240万。 */
export const fmtCompact = (n: number) => compactFormat.format(n)
export const fmtCost = (n: number) => `$${n.toFixed(2)}`
export const fmtCredits = (n: number) => creditsFormat.format(n)
export const fmtPercent = (n: number) => `${Math.round(n)}%`
export const fmtDuration = (seconds: number) => strings.common.duration(seconds)
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—"

/** 日志时间：本地时区的 HH:mm:ss.SSS。 */
export function fmtLogTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number, size = 2) => String(value).padStart(size, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3,
  )}`
}

/** 本地日期的 `YYYY-MM-DD`。 */
export function localYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function shiftDays(days: number, from = new Date()): string {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  return localYmd(date)
}

export function parseYmd(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/** 返回 from 到 to（含两端）的连续日期列表。 */
export function dateRange(from: string, to: string): string[] {
  const days: string[] = []
  const cursor = parseYmd(from)
  const end = parseYmd(to)
  while (cursor <= end && days.length < 400) {
    days.push(localYmd(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}
