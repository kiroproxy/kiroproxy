import { createContext, useContext, useLayoutEffect, type ReactNode } from "react"

export interface PageHeader {
  title?: string
  subtitle?: string
  /** 标题后面的状态徽章等。 */
  badges?: ReactNode
  /** 工具栏右侧的页面主操作。 */
  actions?: ReactNode
  /** 二级页面的返回目标；设置后工具栏左侧显示返回按钮。 */
  back?: string | number
}

export const PageHeaderSetterContext = createContext<((header: PageHeader | null) => void) | null>(
  null,
)
export const PageHeaderValueContext = createContext<PageHeader | null>(null)

/**
 * 页面声明自己的工具栏内容；`deps` 变化时重新提交，页面卸载时清空。
 * 两个都用 layout effect：切换页面时旧页面的清空先于新页面的设置执行，且在绘制前完成，标题不闪。
 */
export function usePageHeader(header: PageHeader, deps: unknown[]) {
  const setHeader = useContext(PageHeaderSetterContext)
  useLayoutEffect(() => {
    setHeader?.(header)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useLayoutEffect(() => () => setHeader?.(null), [setHeader])
}
