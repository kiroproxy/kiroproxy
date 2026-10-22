import { useSyncExternalStore } from "react"
import { hasTauri, ipc } from "./ipc"
import type { UpdateStatus } from "./types"

/**
 * 更新状态由 Rust 侧驱动（启动检查、后台下载），前端只保存最新快照：
 * 平时由 `updater://status` 事件推送，组件挂载时再取一次初始状态。
 */
const IDLE: UpdateStatus = { phase: "idle", currentVersion: "" }

let status: UpdateStatus = IDLE
let dialogOpen = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit() {
  for (const listener of listeners) listener()
}

export function setUpdateStatus(next: UpdateStatus) {
  status = next
  emit()
}

export function useUpdateStatus(): UpdateStatus {
  return useSyncExternalStore(subscribe, () => status, () => status)
}

export function openUpdateDialog() {
  dialogOpen = true
  emit()
}

export function closeUpdateDialog() {
  dialogOpen = false
  emit()
}

export function useUpdateDialogOpen(): boolean {
  return useSyncExternalStore(subscribe, () => dialogOpen, () => dialogOpen)
}

/** 订阅更新事件；返回取消订阅函数。AppShell 只挂一次。 */
export function bindUpdateEvents(): () => void {
  if (!hasTauri()) return () => {}
  let disposed = false
  let unlisten: (() => void) | undefined

  void ipc
    .getUpdateStatus()
    .then((initial) => {
      if (!disposed && initial) setUpdateStatus(initial)
    })
    .catch(() => {
      // 更新模块不可用（如未配置）时保持 idle
    })

  void import("@tauri-apps/api/event")
    .then(({ listen }) =>
      listen<UpdateStatus>("updater://status", (event) => setUpdateStatus(event.payload)),
    )
    .then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    .catch(() => {
      // 事件桥不可用时只显示初始状态
    })

  return () => {
    disposed = true
    unlisten?.()
  }
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function isUpdateVisible(phase: UpdateStatus["phase"]): boolean {
  return phase === "downloading" || phase === "ready" || phase === "installing"
}
