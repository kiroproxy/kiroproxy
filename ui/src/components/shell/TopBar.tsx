import { CheckIcon, MoonIcon, SettingsIcon, SunIcon, SunMoonIcon } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { strings } from "@/lib/strings"
import { useTheme, type Theme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import type { ServerStatus } from "@/lib/types"

const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")

const mainNav = [
  { value: "/", label: strings.nav.overview },
  { value: "/accounts", label: strings.nav.accounts },
  { value: "/keys", label: strings.nav.keys },
  { value: "/usage", label: strings.nav.usage },
  { value: "/logs", label: strings.nav.logs },
  { value: "/models", label: strings.nav.models },
]

const settingsNav = [
  { value: "general", label: strings.settings.sections.general },
  { value: "service", label: strings.settings.sections.service },
  { value: "accounts", label: strings.settings.sections.accounts },
  { value: "network", label: strings.settings.sections.network },
  { value: "features", label: strings.settings.sections.features },
  { value: "data", label: strings.settings.sections.data },
  { value: "appearance", label: strings.settings.sections.appearance },
  { value: "about", label: strings.settings.sections.about },
]

const themeOptions: { value: Theme; label: string }[] = [
  { value: "system", label: strings.settings.themeSystem },
  { value: "light", label: strings.settings.themeLight },
  { value: "dark", label: strings.settings.themeDark },
]

export interface SegmentedNavProps {
  items: { value: string; label: string }[]
  value?: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
}

export function SegmentedNav({ items, value, onChange, ariaLabel, className }: SegmentedNavProps) {
  return (
    <ToggleGroup
      multiple={false}
      value={value ? [value] : []}
      onValueChange={(next) => {
        const selected = next[0]
        if (selected) onChange(selected)
      }}
      aria-label={ariaLabel}
      className={cn(
        "h-8 gap-0 rounded-[12px] border border-border bg-subtle p-0.5",
        className,
      )}
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          className="h-7 rounded-[10px] px-3 text-[12px] data-pressed:bg-card data-pressed:font-semibold data-pressed:shadow-sm data-[state=on]:bg-card data-[state=on]:font-semibold data-[state=on]:shadow-sm"
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function StatusPill({ status, onClick }: { status: ServerStatus; onClick: () => void }) {
  const healthy = status.running && !status.lastError
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={status.running ? strings.status.running : strings.status.stopped}
      className="flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-subtle"
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", healthy ? "bg-success" : "bg-danger")}
      />
      <span>{status.running ? strings.shell.statusRunning : strings.shell.statusStopped}</span>
      <span className="num text-faint">:{status.port}</span>
    </button>
  )
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  const Icon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : SunMoonIcon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="icon" size="icon" aria-label={strings.settings.theme}>
            <Icon />
          </Button>
        }
      />
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

export interface TopBarProps {
  status: ServerStatus
}

export function TopBar({ status }: TopBarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const settingsMode = pathname.startsWith("/settings")
  const activeMain = mainNav.find((item) =>
    item.value === "/" ? pathname === "/" : pathname.startsWith(item.value),
  )?.value
  const activeSection = pathname.split("/")[2] || "general"

  return (
    <header
      data-tauri-drag-region
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
            onClick={() => navigate("/")}
            className="px-2 text-[12px]"
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
        <div className="absolute left-1/2 -translate-x-1/2">
          {settingsMode ? (
            <SegmentedNav
              items={settingsNav}
              value={activeSection}
              onChange={(section) => navigate(`/settings/${section}`)}
              ariaLabel={strings.shell.settingsNavLabel}
              className="max-w-[calc(100vw-360px)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            />
          ) : (
            <SegmentedNav
              items={mainNav}
              value={activeMain}
              onChange={(target) => navigate(target)}
              ariaLabel={strings.shell.mainNavLabel}
            />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {settingsMode ? null : (
          <StatusPill status={status} onClick={() => navigate("/")} />
        )}
        <ThemeMenu />
        {settingsMode ? null : (
          <Button
            variant="icon"
            size="icon"
            aria-label={strings.nav.settings}
            onClick={() => navigate("/settings/general")}
          >
            <SettingsIcon />
          </Button>
        )}
      </div>
    </header>
  )
}
