export interface QuotaRingProps {
  size?: number
  fiveHour: number
  sevenDay: number
}

/**
 * 账号额度双环：外环 5 小时、内环 7 天。
 * 数值为已用百分比（0–100），达到 90% 转 warning，用尽转 danger。
 */
export function QuotaRing({ size = 112, fiveHour, sevenDay }: QuotaRingProps) {
  const sw = size > 60 ? 10 : 3.6
  const r1 = size / 2 - sw / 2
  const r2 = r1 - sw - (size > 60 ? 4 : 1.8)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      {[
        { r: r1, v: fiveHour, stroke: "var(--quota)" },
        { r: r2, v: sevenDay, stroke: "var(--quota-muted)" },
      ].map((ring, i) => (
        <g key={i}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={ring.r}
            fill="none"
            stroke="var(--quota-track)"
            strokeWidth={sw}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={ring.r}
            fill="none"
            stroke={ring.v >= 100 ? "var(--danger)" : ring.v >= 90 ? "var(--warning)" : ring.stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.min(Math.max(ring.v, 0), 100)} 100`}
          />
        </g>
      ))}
    </svg>
  )
}
