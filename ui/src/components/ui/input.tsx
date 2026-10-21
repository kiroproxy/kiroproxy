import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "flex h-[30px] w-full rounded-[10px] border border-border bg-subtle px-2.5 text-[13px] text-foreground outline-none placeholder:text-faint hover:bg-subtle-hover focus-visible:border-primary focus-visible:bg-card focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary aria-invalid:border-danger aria-invalid:bg-danger-soft aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger disabled:opacity-45",
        className
      )}
      {...props}
    />
  )
}

export { Input }
