import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { localYmd, parseYmd } from "@/lib/format"
import { strings } from "@/lib/strings"

/** 双月范围选择器；按需加载（只在选择「自定义」时出现），日历依赖不进首屏包。 */
export default function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [today] = useState(() => new Date())
  const selected: DateRange = { from: parseYmd(from), to: parseYmd(to) }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="secondary" size="sm" className="gap-2" aria-label={strings.usage.pickRange} />
        }
      >
        <CalendarIcon />
        <span className="num">
          {from} → {to}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selected}
          disabled={{ after: today }}
          onSelect={(next: DateRange | undefined) => {
            if (!next?.from) return
            const nextFrom = localYmd(next.from)
            const nextTo = next.to ? localYmd(next.to) : nextFrom
            onChange(nextFrom, nextTo)
            if (next.to) setOpen(false)
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
