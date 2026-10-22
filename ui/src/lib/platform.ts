/** 是否运行在 macOS 上（决定顶栏红绿灯留白和快捷键的写法）。 */
export const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")

/** 快捷键修饰键的显示文字：macOS 写 ⌘，其他系统写 Ctrl+。 */
export const modKeyLabel = isMac ? "⌘" : "Ctrl+"

/** 快捷键是否按下了修饰键（macOS 用 ⌘，其他系统用 Ctrl；两者都接受，避免外接键盘差异）。 */
export function hasModKey(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
}
