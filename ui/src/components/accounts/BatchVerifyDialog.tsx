import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ipc } from "@/lib/ipc"
import { useVerifyAccounts } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { VerifyOutcome } from "@/lib/types"

export function BatchVerifyDialog({
  ids,
  open,
  onOpenChange,
}: {
  ids: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const verify = useVerifyAccounts()
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null)

  useEffect(() => {
    if (!open) {
      setOutcome(null)
    }
  }, [open])

  const start = () => {
    setOutcome(null)
    verify.mutate(ids, {
      onSuccess: (result) => {
        setOutcome(result)
        toast.success(strings.accounts.verify.result(result.success, result.failed))
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const cancel = () => {
    void ipc.cancelVerifyAccounts()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.accounts.verify.title}</DialogTitle>
          <DialogDescription>
            将依次验证选中的 {ids.length} 个账号，每个账号间隔 2 秒。
          </DialogDescription>
        </DialogHeader>

        {verify.isPending ? (
          <div className="flex flex-col gap-2">
            <Progress value={null} />
            <p className="text-[12px] text-muted-foreground">
              正在验活 {ids.length} 个账号…
            </p>
          </div>
        ) : null}

        {outcome ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold">
              {strings.accounts.verify.result(outcome.success, outcome.failed)}
            </p>
            <div className="max-h-56 overflow-y-auto rounded-[10px] bg-subtle p-2">
              {outcome.results.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 py-1 text-[12px] last:border-0"
                >
                  <span className="num">#{item.id}</span>
                  <span
                    className={
                      item.status === "success" ? "text-text-success" : "text-text-danger"
                    }
                  >
                    {item.status === "success"
                      ? strings.accounts.verify.success
                      : strings.accounts.verify.failed}
                  </span>
                  <span className="max-w-[220px] truncate text-muted-foreground">
                    {item.message ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {verify.isPending ? (
            <Button variant="secondary" onClick={cancel}>
              {strings.accounts.verify.cancel}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {strings.common.close}
              </Button>
              <Button onClick={start}>{strings.accounts.verify.start}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
