import { useSyncExternalStore } from "react"

/**
 * 设置页的保存状态，供底部状态栏展示（设计规范：设置状态下状态栏显示保存状态）。
 * - idle：没有修改，显示「修改即时生效」
 * - saved：刚保存，显示「已保存 · 时间」
 * - restart：有字段需要重启代理才生效
 */
export interface SaveStatus {
  kind: "idle" | "saved" | "restart"
  at?: number
  fields?: string[]
}

let current: SaveStatus = { kind: "idle" }
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setSaveStatus(next: SaveStatus) {
  current = next
  emit()
}

export function markSaved(restartFields: string[] = []) {
  const pending = current.kind === "restart" ? (current.fields ?? []) : []
  const fields = Array.from(new Set([...pending, ...restartFields]))
  setSaveStatus(
    fields.length > 0 ? { kind: "restart", at: Date.now(), fields } : { kind: "saved", at: Date.now() },
  )
}

export function clearRestartRequired() {
  setSaveStatus({ kind: "saved", at: Date.now() })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(subscribe, () => current, () => current)
}
