import type { ReactNode } from "react"
import { ArrowLeftIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { strings } from "@/lib/strings"

export interface ToolbarProps {
  title: string
  subtitle?: string
  badges?: ReactNode
  actions?: ReactNode
  back?: string | number
}

export function Toolbar({ title, subtitle, badges, actions, back }: ToolbarProps) {
  const navigate = useNavigate()
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        {back !== undefined ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="icon"
                  size="icon"
                  aria-label={strings.common.back}
                  className="-ml-2"
                  onClick={() => (typeof back === "number" ? navigate(back) : navigate(back))}
                />
              }
            >
              <ArrowLeftIcon />
            </TooltipTrigger>
            <TooltipContent>{strings.common.back}</TooltipContent>
          </Tooltip>
        ) : null}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate font-serif text-[17px] font-semibold tracking-[-0.01em]">
              {title}
            </h1>
            {badges}
          </div>
          {subtitle ? (
            <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
