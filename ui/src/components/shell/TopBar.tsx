import { useEffect, useRef, type MouseEvent } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { ArrowDownToLineIcon, CheckIcon, MoonIcon, SettingsIcon, SunIcon, SunMoonIcon } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { strings } from "@/lib/strings"
import { themeOptions, useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { isUpdateVisible, openUpdateDialog, useUpdateStatus } from "@/lib/update-status"
import { mainNav, settingsNav, settingsSections } from "./nav"

const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")

export interface SegmentedNavProps {
  items: { value: string; label: string }[]
  value?: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  /** 作为页面导航使用时，选中项带 aria-current="page"。 */
  navigation?: boolean
}

export function SegmentedNav({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  navigation = false,
}: SegmentedNavProps) {
  return (
    <ToggleGroup
      variant="segmented"
      multiple={false}
      value={value ? [value] : []}
      onValueChange={(next) => {
        const selected = next[0]
        if (selected) onChange(selected)
      }}
      aria-label={ariaLabel}
      className={className}
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          aria-current={navigation && item.value === value ? "page" : undefined}
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="icon" size="icon" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/** 更新进行中/已就绪时的小胶囊，点击打开更新面板。 */
function UpdatePill() {
  const status = useUpdateStatus()
  if (!isUpdateVisible(status.phase)) return null
  const label =
    status.phase === "ready"
      ? strings.update.pillReady
      : status.phase === "installing"
        ? strings.update.pillInstalling
        : strings.update.pillDownloading(Math.round(status.progress ?? 0))
  return (
    <Button
      variant="capsule"
      size="sm"
      onClick={openUpdateDialog}
      className={cn(
        "gap-1.5",
        status.phase === "ready" && "border-primary/40 text-text-danger",
      )}
    >
      <ArrowDownToLineIcon className={cn(status.phase === "installing" && "animate-pulse")} />
      {label}
    </Button>
  )
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  const Icon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : SunMoonIcon
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="icon" size="icon" aria-label={strings.settings.theme} />}
            />
          }
        >
          <Icon />
        </TooltipTrigger>
        <TooltipContent side="bottom">{strings.settings.theme}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-36">
        {themeOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            className="justify-between"
          >
            {option.label}
            {theme === option.value ? <CheckIcon /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const settingsMode = pathname.startsWith("/settings")
  const activeMain = mainNav.find((item) =>
    item.value === "/" ? pathname === "/" : pathname.startsWith(item.value),
  )?.value
  const activeSection = pathname.split("/")[2] || settingsSections[0]
  // 「返回应用」回到进入设置前所在的页面。
  const lastAppPath = useRef("/")
  useEffect(() => {
    if (!settingsMode) lastAppPath.current = pathname
  }, [pathname, settingsMode])

  const handleDragStart = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target
    if (
      target instanceof HTMLElement &&
      target.closest("button, a, input, textarea, select, [role='tab'], [data-no-drag]")
    ) {
      return
    }
    try {
      void getCurrentWindow().startDragging().catch(() => undefined)
    } catch {
      // 浏览器预览环境没有 Tauri 窗口 API。
    }
  }

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleDragStart}
      className={cn(
        "relative flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel pr-3.5",
        isMac ? "pl-[78px]" : "pl-3.5",
      )}
    >
      <div data-tauri-drag-region className="flex min-w-0 shrink-0 items-center">
        {settingsMode ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(lastAppPath.current)}
            className="px-2 text-[12px] text-muted-foreground"
          >
            {strings.nav.back}
          </Button>
        ) : (
          <div
            data-tauri-drag-region
            className="flex h-8 select-none items-center gap-2 px-2 text-[12.5px] font-semibold text-foreground"
          >
            <span className="size-2 rounded-full bg-primary" />
            {strings.app.name}
          </div>
        )}
      </div>

      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center justify-center">
        <nav
          aria-label={settingsMode ? strings.shell.settingsNavLabel : strings.shell.mainNavLabel}
          className="absolute left-1/2 -translate-x-1/2"
        >
          {settingsMode ? (
            <SegmentedNav
              navigation
              items={settingsNav}
              value={activeSection}
              onChange={(section) => navigate(`/settings/${section}`)}
              ariaLabel={strings.shell.settingsNavLabel}
              className="max-w-[calc(100vw-320px)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            />
          ) : (
            <SegmentedNav
              navigation
              items={mainNav}
              value={activeMain}
              onChange={(target) => navigate(target)}
              ariaLabel={strings.shell.mainNavLabel}
            />
          )}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <UpdatePill />
        <ThemeMenu />
        {settingsMode ? null : (
          <IconButton label={strings.nav.settings} onClick={() => navigate("/settings/service")}>
            <SettingsIcon />
          </IconButton>
        )}
      </div>
    </header>
  )
}
