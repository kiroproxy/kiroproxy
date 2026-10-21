import type { ReactNode } from "react"

export interface ToolbarProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function Toolbar({ title, subtitle, actions }: ToolbarProps) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-4 px-6">
      <div className="min-w-0">
        <h1 className="truncate font-serif text-[17px] font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
