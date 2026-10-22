import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * 表单项：标签 + 控件 + 可选说明。自动生成 id，把 label 的 htmlFor 与控件关联，
 * 并用 aria-describedby 关联说明文字。控件需要是单个可接收 id 的元素。
 */
export function FormField({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: ReactNode
  className?: string
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>
}) {
  const generated = useId()
  const id = isValidElement(children) && children.props.id ? children.props.id : generated
  const hintId = `${id}-hint`
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": hint ? hintId : children.props["aria-describedby"],
      })
    : children
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint ? (
        <p id={hintId} className="text-[11.5px] leading-4 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
