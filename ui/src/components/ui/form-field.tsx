import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type FieldControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }

/**
 * 表单项：标签 + 控件 + 可选说明 / 错误。自动生成 id，把 label 的 htmlFor 与控件关联，
 * 并用 aria-describedby 关联说明和错误文字；有错误时给控件标上 aria-invalid（控件据此换错误样式）。
 * 控件需要是单个可接收 id 的元素。
 */
export function FormField({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string
  hint?: ReactNode
  /** 校验错误；有值时显示在控件下方并读给读屏器。 */
  error?: string | null
  className?: string
  children: ReactElement<FieldControlProps>
}) {
  const generated = useId()
  const id = isValidElement(children) && children.props.id ? children.props.id : generated
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [hint ? hintId : null, error ? errorId : null, children.props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
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
      {error ? (
        <p id={errorId} role="alert" className="text-[11.5px] leading-4 text-text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
