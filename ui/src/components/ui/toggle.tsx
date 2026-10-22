"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-[10px] text-[12px] font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-transparent hover:bg-subtle hover:text-foreground data-pressed:bg-subtle",
        outline:
          "border border-border-strong bg-transparent hover:bg-subtle hover:text-foreground data-pressed:bg-subtle",
        // 导航式分段控件（顶栏导航、设置分区、主题）：未选中项深色字，选中项 card 底加轻阴影。
        segmented:
          "text-foreground data-pressed:bg-card data-pressed:font-semibold data-pressed:shadow-sm",
        // 筛选式分段控件：外观与 Tabs 一致，未选中项灰字，悬停变深。
        filter:
          "text-muted-foreground hover:text-foreground data-pressed:bg-card data-pressed:font-semibold data-pressed:text-foreground data-pressed:shadow-sm",
      },
      size: {
        default: "h-8 min-w-8 px-2.5",
        sm: "h-7 min-w-7 px-2.5",
        lg: "h-9 min-w-9 px-2.5",
      },
    },
    compoundVariants: [
      { variant: "segmented", className: "h-7 min-w-0 px-3" },
      { variant: "filter", className: "h-[26px] min-w-0 px-3" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
