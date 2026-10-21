import { AlertTriangleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ipc } from "@/lib/ipc"
import { strings } from "@/lib/strings"
import type { IpcError } from "@/lib/types"

export function StartupError({
  error,
  onRetry,
}: {
  error: IpcError
  onRetry: () => void
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-[520px] gap-4 p-5">
        <CardHeader className="items-center text-center">
          <div className="mb-2 grid size-12 place-items-center rounded-full bg-danger-soft text-text-danger">
            <AlertTriangleIcon className="size-6" />
          </div>
          <CardTitle className="font-serif text-[20px]">{strings.errors.startupTitle}</CardTitle>
          <p className="text-[12px] text-muted-foreground">{strings.errors.startupHint}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-[10px] bg-subtle p-3 font-mono text-[11.5px]">
            <div className="font-semibold text-text-danger">{error.code}</div>
            <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{error.message}</div>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => void ipc.openDataDir()}>
              {strings.errors.openDataDir}
            </Button>
            <Button onClick={onRetry}>{strings.errors.retry}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
