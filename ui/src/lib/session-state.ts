import { useEffect, useState } from "react"

/**
 * 和 useState 一样，但值存在 sessionStorage 里：切到别的页面再回来时保留上次的选择，
 * 关闭应用后清空。读写失败（如存储不可用）时退化成普通 state。
 */
export function useSessionState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw !== null) return JSON.parse(raw) as T
    } catch {
      // 读不到就用初始值
    }
    return typeof initial === "function" ? (initial as () => T)() : initial
  })

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 存不了只影响跨页面保留，不影响当前页面
    }
  }, [key, value])

  return [value, setValue] as const
}
