import { quotaTone } from "@/lib/account-status"
import { fmtPercent } from "@/lib/format"
import { strings } from "@/lib/strings"

const toneStroke = {
  quota: "var(--quota)",
  warning: "var(--warning)",
  danger: "var(--danger)",
} as const

export interface QuotaRingProps {
  size?: number
  /** 本月已用百分比（0–100）。 */
  percent: number
}

/**
 * 月度额度环：Kiro 只有自然月额度，没有 5 小时 / 7 天窗口，所以是单环。
 * 达到 90% 换 warning，用尽换 danger；圆心写百分比，旁边仍需文字说明。
 */
export function QuotaRing({ size = 112, percent }: QuotaRingProps) {
  const stroke = size > 60 ? 10 : 4
  const radius = size / 2 - stroke / 2
  const value = Math.min(Math.max(percent, 0), 100)
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={strings.a11y.quotaRing(fmtPercent(percent))}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--quota-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={toneStroke[quotaTone(percent)]}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${value} 100`}
          className="transition-[stroke-dasharray] duration-300"
        />
      </svg>
      <span className="num absolute text-[20px] font-semibold tracking-[-0.01em]">
        {fmtPercent(percent)}
      </span>
    </div>
  )
}
