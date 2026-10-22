import { useSyncExternalStore } from "react"

/** 命令面板的开关状态：顶栏按钮和 ⌘K 都能打开，所以放在模块级 store 里。 */
let open = false
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

export function setCommandPaletteOpen(next: boolean) {
  if (open === next) return
  open = next
  emit()
}

export function toggleCommandPalette() {
  setCommandPaletteOpen(!open)
}

export function useCommandPaletteOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => open)
}
