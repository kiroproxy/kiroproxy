import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// 键盘焦点按设计规范用底色变化表达；浅底按钮的底色差很小，额外加 1px 内描边保证可见，不画外圈。
const buttonVariants = cva(
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-semibold transition-colors outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active focus-visible:bg-primary-active focus-visible:ring-0",
        secondary:
          "border border-border-strong bg-card text-foreground hover:bg-subtle focus-visible:bg-nav-active",
        ghost: "text-foreground hover:bg-subtle focus-visible:bg-nav-active",
        danger:
          "border border-danger/45 bg-card text-text-danger hover:bg-danger-soft focus-visible:bg-danger-soft focus-visible:ring-danger/60",
        icon: "size-8 p-0 text-muted-foreground hover:bg-subtle hover:text-foreground focus-visible:bg-nav-active focus-visible:text-foreground",
        capsule:
          "border border-foreground/10 bg-card text-foreground shadow-sm hover:bg-subtle focus-visible:bg-nav-active",
      },
      size: {
        default: "h-8",
        sm: "h-[26px] px-2.5 text-[12px]",
        icon: "size-8 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
