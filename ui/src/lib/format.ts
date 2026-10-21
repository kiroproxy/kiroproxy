export const fmtNumber = (n: number) => new Intl.NumberFormat("en-US").format(n)
export const fmtCost = (n: number) => `$${n.toFixed(2)}`
export const fmtDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s ? `${m} 分 ${s} 秒` : `${m} 分`
}
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—"
