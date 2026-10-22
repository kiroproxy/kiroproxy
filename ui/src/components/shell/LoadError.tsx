import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { errorMessage } from "@/lib/ipc"
import { strings } from "@/lib/strings"

/** 查询失败时的统一占位：写清原因，只给一个「重新加载」。 */
export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Empty className="border-danger/30 bg-danger-soft/30">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-danger-soft text-text-danger">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{strings.errors.loadFailed}</EmptyTitle>
        <EmptyDescription>{errorMessage(error, strings.errors.loadFailedHint)}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {strings.common.retryLoad}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
