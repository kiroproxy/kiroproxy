import { Button } from "@/components/ui/button"
import { strings } from "@/lib/strings"

export function Pager({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number
  totalPages: number
  total?: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1 && total === undefined) return null
  return (
    <div className="flex items-center justify-end gap-2 pt-3 text-[12px] text-muted-foreground">
      {total !== undefined ? <span className="num mr-auto">{strings.common.totalCount(total)}</span> : null}
      <span className="num">{strings.common.pageOf(page, Math.max(totalPages, 1))}</span>
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {strings.common.prevPage}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        {strings.common.nextPage}
      </Button>
    </div>
  )
}
