import { useEffect, useRef, useState } from "react"
import { hasTauri, ipc } from "./ipc"
import type { LogEntry } from "./types"

export const MAX_LOG_ENTRIES = 1000

function merge(prev: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  if (incoming.length === 0) return prev
  const last = prev.length > 0 ? prev[prev.length - 1].seq : 0
  // 快照与事件可能重叠：只保留比已有序号更新的条目。
  const fresh = incoming.filter((entry) => entry.seq > last)
  if (fresh.length === 0) return prev
  const next = prev.concat(fresh)
  return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next
}

/**
 * 运行日志流：先订阅 `log://batch` 再取快照，保证不漏条；
 * 同一帧内到达的批次合并成一次 setState。
 */
export function useLogStream() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const pending = useRef<LogEntry[]>([])
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (!hasTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined

    const flush = () => {
      frame.current = null
      const batch = pending.current
      pending.current = []
      if (!disposed && batch.length > 0) setEntries((prev) => merge(prev, batch))
    }

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event")
        const stop = await listen<LogEntry[]>("log://batch", (event) => {
          pending.current.push(...event.payload)
          if (frame.current === null) frame.current = requestAnimationFrame(flush)
        })
        if (disposed) {
          stop()
          return
        }
        unlisten = stop
      } catch {
        // 事件桥不可用时只展示快照。
      }
      try {
        const snapshot = await ipc.getLogSnapshot()
        if (!disposed) setEntries((prev) => merge(snapshot.slice(-MAX_LOG_ENTRIES), prev))
      } catch {
        // 启动早期快照可能不可用，事件会继续补齐。
      }
    })()

    return () => {
      disposed = true
      unlisten?.()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [])

  const clear = () => {
    pending.current = []
    setEntries([])
  }

  return { entries, clear }
}
