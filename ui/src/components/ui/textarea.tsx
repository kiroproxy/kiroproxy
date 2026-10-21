import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[10px] border border-border bg-subtle px-2.5 py-2 text-[13px] transition-colors outline-none placeholder:text-faint hover:bg-subtle-hover focus-visible:border-primary focus-visible:bg-card focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger aria-invalid:bg-danger-soft aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
