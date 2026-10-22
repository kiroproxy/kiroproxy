import { useState } from "react"
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
import { accountName } from "@/lib/account-status"
import { ipc } from "@/lib/ipc"
import { useAccounts, useVerifyAccounts } from "@/lib/queries"
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
  const accounts = useAccounts()
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null)
  const names = new Map((accounts.data?.credentials ?? []).map((item) => [item.id, accountName(item)]))

  const handleOpenChange = (next: boolean) => {
    if (!next) setOutcome(null)
    onOpenChange(next)
  }

  const start = () => {
    setOutcome(null)
    verify.mutate(ids, {
      onSuccess: (result) => {
        setOutcome(result)
        toast.success(strings.accounts.verify.result(result.success, result.failed))
      },
    })
  }

  const cancel = () => {
    void ipc.cancelVerifyAccounts()
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.accounts.verify.title}</DialogTitle>
          <DialogDescription>{strings.accounts.verifyHint(ids.length)}</DialogDescription>
        </DialogHeader>

        {verify.isPending ? (
          <div className="flex flex-col gap-2">
            <Progress value={null} />
            <p className="text-[12px] text-muted-foreground">{strings.accounts.verifyRunning(ids.length)}</p>
          </div>
        ) : null}

        {outcome ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold">
              {strings.accounts.verify.result(outcome.success, outcome.failed)}
            </p>
            <ul className="max-h-56 overflow-y-auto rounded-[10px] bg-subtle p-2">
              {outcome.results.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 py-1 text-[12px] last:border-0"
                >
                  <span className="min-w-0 truncate">{names.get(item.id) ?? `#${item.id}`}</span>
                  <span
                    className={item.status === "success" ? "text-text-success" : "text-text-danger"}
                  >
                    {item.status === "success"
                      ? strings.accounts.verify.success
                      : strings.accounts.verify.failed}
                  </span>
                  <span className="max-w-[200px] truncate text-muted-foreground" title={item.message ?? undefined}>
                    {item.message ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          {verify.isPending ? (
            <Button variant="secondary" onClick={cancel}>
              {strings.accounts.verify.cancel}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => handleOpenChange(false)}>
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
