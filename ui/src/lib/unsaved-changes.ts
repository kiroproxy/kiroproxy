import { useEffect, useSyncExternalStore } from "react"

/**
 * 未保存修改的登记处。设置分区有改动还没保存时在这里登记；离开前（切换分区、返回应用、
 * 快捷键切页）先经过 requestLeave，由确认框决定是否放弃，避免改动被静默丢掉。
 */
const owners = new Set<string>()
let pendingLeave: (() => void) | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setUnsaved(owner: string, dirty: boolean) {
  if (dirty === owners.has(owner)) return
  if (dirty) owners.add(owner)
  else owners.delete(owner)
  emit()
}

export function hasUnsavedChanges(): boolean {
  return owners.size > 0
}

/** 组件声明自己是否有未保存的修改；卸载时自动撤销登记。 */
export function useUnsavedChanges(owner: string, dirty: boolean) {
  useEffect(() => {
    setUnsaved(owner, dirty)
  }, [owner, dirty])
  useEffect(() => () => setUnsaved(owner, false), [owner])
}

export function useHasUnsavedChanges(): boolean {
  return useSyncExternalStore(subscribe, hasUnsavedChanges, hasUnsavedChanges)
}

/** 没有未保存修改时立即执行离开动作；否则先挂起，等用户在确认框里选择。 */
export function requestLeave(action: () => void) {
  if (!hasUnsavedChanges()) {
    action()
    return
  }
  pendingLeave = action
  emit()
}

export function usePendingLeave(): (() => void) | null {
  return useSyncExternalStore(
    subscribe,
    () => pendingLeave,
    () => pendingLeave,
  )
}

/** 放弃修改并继续离开。 */
export function confirmLeave() {
  const action = pendingLeave
  pendingLeave = null
  owners.clear()
  emit()
  action?.()
}

/** 留在当前页面继续编辑。 */
export function cancelLeave() {
  if (pendingLeave === null) return
  pendingLeave = null
  emit()
}
