import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { errorMessage } from "@/lib/ipc"
import { queryKeys, useRestartProxy } from "@/lib/queries"
import { clearRestartRequired, markSaved } from "@/lib/save-status"
import { strings } from "@/lib/strings"
import type { ApplyResult } from "@/lib/types"

/** 立即生效的开关、选项：写入后把返回的设置放进缓存，并更新状态栏的保存状态。 */
export function useApplySetting() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<ApplyResult>): Promise<ApplyResult | null> => {
    setBusy(true)
    try {
      const result = await fn()
      qc.setQueryData(queryKeys.settings, result.settings)
      markSaved(result.restartRequired)
      return result
    } catch (error) {
      toast.error(errorMessage(error))
      return null
    } finally {
      setBusy(false)
    }
  }
  return { run, busy }
}

export function useRestartAction() {
  const restart = useRestartProxy()
  const run = () =>
    restart.mutate(undefined, {
      onSuccess: () => {
        clearRestartRequired()
        toast.success(strings.settings.restartDone)
      },
    })
  return { run, pending: restart.isPending }
}

export function isNonNegativeInteger(value: string): boolean {
  return /^\d+$/.test(value.trim())
}
