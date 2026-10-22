import { Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { toggleCommandPalette } from "@/lib/command-palette"
import { hasModKey } from "@/lib/platform"
import { strings } from "@/lib/strings"
import { requestLeave } from "@/lib/unsaved-changes"
import { bindUpdateEvents, openUpdateDialog, useUpdateStatus } from "@/lib/update-status"
import { UpdateDialog } from "@/components/update/UpdateDialog"
import { cn } from "@/lib/utils"
import { CommandPalette } from "./CommandPalette"
import { LeaveGuardDialog } from "./LeaveGuardDialog"
import { isSettingsSection, mainNav } from "./nav"
import { PageHeaderSetterContext, PageHeaderValueContext, type PageHeader } from "./page-header"
import { StatusBar } from "./StatusBar"
import { Toolbar } from "./Toolbar"
import { TopBar } from "./TopBar"
import { useShellStatus } from "./use-shell-status"

interface PageMeta {
  title: string
  subtitle: string
  /** 内容列最大宽度；设置与接入页是单列，其余页面放宽到 1280。 */
  width: "content" | "column"
}

function usePageMeta(): PageMeta {
  const { pathname } = useLocation()
  const content = (title: string, subtitle: string): PageMeta => ({ title, subtitle, width: "content" })

  if (pathname === "/") return content(strings.overview.title, strings.overview.subtitle)
  if (pathname.startsWith("/accounts/")) return content(strings.accounts.details, "")
  if (pathname.startsWith("/accounts")) return content(strings.accounts.title, strings.accounts.subtitle)
  if (pathname.startsWith("/keys/")) return content(strings.keys.details, "")
  if (pathname.startsWith("/keys")) return content(strings.keys.title, strings.keys.subtitle)
  if (pathname.startsWith("/usage")) return content(strings.usage.title, strings.usage.subtitle)
  if (pathname.startsWith("/logs")) return content(strings.logs.title, strings.logs.subtitle)
  if (pathname.startsWith("/models")) return content(strings.models.title, strings.models.subtitle)
  if (pathname.startsWith("/settings")) {
    const section = pathname.split("/")[2]
    if (isSettingsSection(section)) {
      return {
        title: strings.settings.sections[section],
        subtitle: strings.settings.sectionHints[section],
        width: "column",
      }
    }
    return { title: strings.settings.title, subtitle: strings.settings.subtitle, width: "column" }
  }
  if (pathname.startsWith("/connect")) {
    return { title: strings.connect.title, subtitle: strings.connect.subtitle, width: "column" }
  }
  return content(strings.app.name, "")
}

function PageFallback() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={strings.common.loading}>
      <Skeleton className="h-24 w-full rounded-[16px]" />
      <Skeleton className="h-48 w-full rounded-[16px]" />
    </div>
  )
}

export function AppShell({ children }: { children?: ReactNode }) {
  const meta = usePageMeta()
  const shellStatus = useShellStatus()
  const [header, setHeader] = useState<PageHeader | null>(null)
  const { pathname } = useLocation()
  // 日志页需要固定工具栏、只滚动日志区，主区域改为 flex 列并取消自身滚动。
  const fill = pathname.startsWith("/logs")
  const width = meta.width === "column" ? "max-w-[760px]" : "max-w-[1280px]"
  const update = useUpdateStatus()
  const notifiedVersion = useRef<string | null>(null)

  useEffect(() => bindUpdateEvents(), [])

  // 桌面应用常用快捷键：⌘K 命令面板，⌘1–6 切换页面，⌘, 打开设置（Windows / Linux 用 Ctrl）。
  const navigate = useNavigate()
  const inSettings = pathname.startsWith("/settings")
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!hasModKey(event)) return
      if (event.key.toLowerCase() === "k") {
        event.preventDefault()
        toggleCommandPalette()
        return
      }
      if (event.key === ",") {
        event.preventDefault()
        if (!inSettings) navigate("/settings/service")
        return
      }
      const page = /^[1-9]$/.test(event.key) ? mainNav[Number(event.key) - 1] : undefined
      if (page) {
        event.preventDefault()
        requestLeave(() => navigate(page.value))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [navigate, inSettings])

  // 更新包下载完成后提示一次；同一版本只提醒一次
  useEffect(() => {
    const version = update.latestVersion
    if (update.phase !== "ready" || !version || notifiedVersion.current === version) return
    notifiedVersion.current = version
    toast.info(strings.update.toastReady(version), {
      duration: 12_000,
      action: { label: strings.update.restartNow, onClick: openUpdateDialog },
    })
  }, [update.phase, update.latestVersion])

  return (
    <TooltipProvider>
      <PageHeaderSetterContext.Provider value={setHeader}>
        <PageHeaderValueContext.Provider value={header}>
          <div className="flex h-screen flex-col bg-background">
            <TopBar />
            {/* 工具栏固定在内容区上方，页面主操作不会随内容滚走 */}
            <div className="shrink-0 px-6">
              <div className={cn("mx-auto w-full", width)}>
                <Toolbar
                  title={header?.title ?? meta.title}
                  subtitle={header?.subtitle ?? meta.subtitle}
                  badges={header?.badges}
                  actions={header?.actions}
                  back={header?.back}
                />
              </div>
            </div>
            <main
              className={cn(
                "flex min-h-0 flex-1 flex-col px-6 pb-5",
                fill ? "overflow-hidden" : "overflow-y-auto",
              )}
            >
              <div className={cn("mx-auto flex min-h-0 w-full flex-1 flex-col", width)}>
                <Suspense fallback={<PageFallback />}>{children ?? <Outlet />}</Suspense>
              </div>
            </main>
            <StatusBar status={shellStatus} />
            <UpdateDialog />
            <LeaveGuardDialog />
            <CommandPalette />
          </div>
        </PageHeaderValueContext.Provider>
      </PageHeaderSetterContext.Provider>
    </TooltipProvider>
  )
}
