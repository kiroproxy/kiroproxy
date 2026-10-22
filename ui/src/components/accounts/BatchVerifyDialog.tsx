import { useEffect, useRef, useState } from "react"
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
import { cn } from "@/lib/utils"
import type { VerifyOutcome } from "@/lib/types"

/** 后端每验完一个账号推送一次（`accounts://verify-progress`）。 */
interface VerifyProgressEvent {
  current: number
  total: number
  id: number
  status: "success" | "failed"
  message?: string | null
}

type RowStatus = "pending" | "verifying" | "success" | "failed" | "skipped"

interface Row {
  status: RowStatus
  message?: string | null
}

/** 后端两个账号之间固定间隔 2 秒，用来估算剩余时间。 */
const INTERVAL_SECONDS = 2

const ROW_LABEL: Record<RowStatus, string> = {
  pending: strings.accounts.verify.pending,
  verifying: strings.accounts.verify.verifying,
  success: strings.accounts.verify.success,
  failed: strings.accounts.verify.failed,
  skipped: strings.accounts.verify.skipped,
}

const ROW_TONE: Record<RowStatus, string> = {
  pending: "text-muted-foreground",
  verifying: "text-text-info",
  success: "text-text-success",
  failed: "text-text-danger",
  skipped: "text-muted-foreground",
}

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
  const [rows, setRows] = useState<Record<number, Row>>({})
  const [order, setOrder] = useState<number[]>([])
  const [done, setDone] = useState(0)
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null)
  const [cancelling, setCancelling] = useState(false)
  // 每次开始 / 关闭都换一个轮次，关闭后才返回的旧结果不会再写回界面。
  const run = useRef(0)
  const activeIds = useRef<number[]>([])
  const names = new Map((accounts.data?.credentials ?? []).map((item) => [item.id, accountName(item)]))
  const running = verify.isPending && order.length > 0

  useEffect(() => {
    if (!open) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<VerifyProgressEvent>("accounts://verify-progress", ({ payload }) => {
          const list = activeIds.current
          // Kiro IDE 导入也会发同名事件，只处理本次验活的账号。
          if (!list.includes(payload.id)) return
          setDone(payload.current)
          setRows((prev) => {
            const next = { ...prev, [payload.id]: { status: payload.status, message: payload.message } }
            const following = list[payload.current]
            if (following !== undefined && next[following]?.status === "pending") {
              next[following] = { status: "verifying" }
            }
            return next
          })
        }),
      )
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [open])

  const reset = () => {
    run.current += 1
    activeIds.current = []
    setRows({})
    setOrder([])
    setDone(0)
    setOutcome(null)
    setCancelling(false)
  }

  const handleOpenChange = (next: boolean) => {
    // 关闭时验活若还在进行，会在后台继续，结束后仍弹出结果提示。
    if (!next) reset()
    onOpenChange(next)
  }

  const start = () => {
    reset()
    const thisRun = run.current
    activeIds.current = ids
    setOrder(ids)
    setRows(Object.fromEntries(ids.map((id, index) => [id, { status: index === 0 ? "verifying" : "pending" }])))
    verify.mutate(ids, {
      onSuccess: (result) => {
        toast.success(strings.accounts.verify.result(result.success, result.failed))
        if (run.current !== thisRun) return
        setOutcome(result)
        setDone(result.results.length)
        // 以最终结果为准；取消后没轮到的账号标成「未验证」。
        setRows((prev) => {
          const next: Record<number, Row> = {}
          for (const id of ids) {
            const status = prev[id]?.status
            next[id] = status === "pending" || status === "verifying" ? { status: "skipped" } : prev[id]
          }
          for (const item of result.results) next[item.id] = { status: item.status, message: item.message }
          return next
        })
      },
      onSettled: () => {
        if (run.current === thisRun) setCancelling(false)
      },
    })
  }

  // 取消后后端验完当前账号就停下，保持弹窗打开，等返回已完成部分的结果。
  const cancel = () => {
    setCancelling(true)
    void ipc.cancelVerifyAccounts()
  }

  const total = order.length
  const remainingSeconds = Math.max(0, total - done - 1) * INTERVAL_SECONDS

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.accounts.verify.title}</DialogTitle>
          <DialogDescription>{strings.accounts.verifyHint(ids.length)}</DialogDescription>
        </DialogHeader>

        {running ? (
          <div className="flex flex-col gap-2">
            <Progress value={total > 0 ? (done / total) * 100 : 0} aria-label={strings.accounts.verify.title} />
            <p className="num text-[12px] text-muted-foreground">
              {strings.accounts.verify.progress(done, total)}
              {remainingSeconds > 0 ? ` · ${strings.accounts.verify.eta(remainingSeconds)}` : null}
            </p>
          </div>
        ) : null}

        {outcome ? (
          <p className="text-[13px] font-semibold">
            {strings.accounts.verify.result(outcome.success, outcome.failed)}
          </p>
        ) : null}

        {order.length > 0 ? (
          <ul className="max-h-56 overflow-y-auto rounded-[10px] bg-subtle p-2" aria-label={strings.accounts.verify.title}>
            {order.map((id) => {
              const row = rows[id] ?? { status: "pending" }
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 py-1 text-[12px] last:border-0"
                >
                  <span className="min-w-0 truncate">{names.get(id) ?? `#${id}`}</span>
                  <span className={cn("shrink-0", ROW_TONE[row.status])}>{ROW_LABEL[row.status]}</span>
                  <span className="max-w-[200px] truncate text-muted-foreground" title={row.message ?? undefined}>
                    {row.message ?? "—"}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}

        <DialogFooter>
          {running ? (
            <Button variant="secondary" onClick={cancel} disabled={cancelling}>
              {cancelling ? strings.accounts.verify.cancelling : strings.accounts.verify.cancel}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                {strings.common.close}
              </Button>
              <Button onClick={start} disabled={ids.length === 0}>
                {strings.accounts.verify.start}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
