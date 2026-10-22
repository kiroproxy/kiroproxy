import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "./queries"
import { strings } from "./strings"
import type { OauthStatus } from "./types"

/** 当前挂载着的浏览器登录表单数量；表单自己会展示失败原因，这时不再弹全局提示。 */
let openForms = 0

export function useLoginFormPresence() {
  useEffect(() => {
    openForms += 1
    return () => {
      openForms -= 1
    }
  }, [])
}

/**
 * 全局监听浏览器登录结果（应用里只挂一次）。关掉「添加账号」弹窗后登录仍在后台继续，
 * 成功时在这里刷新账号列表并提示；弹窗开着时同样由这里提示，表单只负责关闭弹窗。
 */
export function useOauthNotifications() {
  const queryClient = useQueryClient()
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<OauthStatus>("oauth://status", ({ payload }) => {
          if (payload.phase === "success") {
            void queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
            toast.success(payload.message ?? strings.accounts.oauth.success)
          } else if (payload.phase === "failed" && openForms === 0) {
            toast.error(payload.message ?? strings.accounts.oauth.failed)
          }
        }),
      )
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {
        // 浏览器预览环境没有事件桥
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [queryClient])
}
