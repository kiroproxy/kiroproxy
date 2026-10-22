import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * 表格比容器宽时才开启横向滚动。横向滚动的容器会成为 sticky 的参照（它自己不纵向滚动），
 * 表头就吸不到外层滚动区的顶部；所以宽度够用时容器保持不滚动，表头吸附在主内容区、弹窗等
 * 外层滚动区的顶部，只有窗口太窄、必须横向滚动时才退化为不吸顶。
 */
function useHorizontalOverflow(
  container: React.RefObject<HTMLDivElement | null>,
  table: React.RefObject<HTMLTableElement | null>,
): boolean {
  const [overflowing, setOverflowing] = React.useState(false)
  React.useLayoutEffect(() => {
    const box = container.current
    const content = table.current
    if (!box || !content || typeof ResizeObserver === "undefined") return
    // 切换横向滚动不改变表格自身宽度，不会来回抖动；+1 容忍取整误差。
    const update = () => setOverflowing(content.offsetWidth > box.clientWidth + 1)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(box)
    observer.observe(content)
    return () => observer.disconnect()
  }, [container, table])
  return overflowing
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const tableRef = React.useRef<HTMLTableElement>(null)
  const scrollX = useHorizontalOverflow(containerRef, tableRef)
  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      className={cn("relative w-full", scrollX && "overflow-x-auto")}
    >
      <table
        {...props}
        ref={tableRef}
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // 分隔线画在吸顶的表头单元格上（见 TableHead）；行边框在 border-collapse 下不随单元格吸顶。
      className={cn("[&_tr]:border-b-0", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "h-[52px] border-b border-border transition-colors hover:bg-subtle has-aria-expanded:bg-subtle data-[state=selected]:bg-subtle",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // 吸顶放在单元格上：各引擎对 <th> 的 sticky 支持最稳定。
        "sticky top-0 z-10 h-10 bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground shadow-[inset_0_-1px_0_var(--border)] [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
