import { useId, useState, type KeyboardEvent } from "react"
import { useNavigate } from "react-router-dom"
import { SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { accountName } from "@/lib/account-status"
import { setCommandPaletteOpen, useCommandPaletteOpen } from "@/lib/command-palette"
import { errorMessage, ipc } from "@/lib/ipc"
import { modKeyLabel } from "@/lib/platform"
import { useAccounts, useApiKeys, useServerStatus } from "@/lib/queries"
import { strings } from "@/lib/strings"
import { requestLeave } from "@/lib/unsaved-changes"
import { cn } from "@/lib/utils"
import { mainNav, settingsSections } from "./nav"

interface Command {
  id: string
  group: string
  label: string
  /** 只用于搜索匹配的额外文字（邮箱、登录来源等）。 */
  keywords?: string
  /** 右侧显示的快捷键。 */
  shortcut?: string
  run: () => void
}

const MAX_RESULTS = 50

/** ⌘K 命令面板：跳转页面 / 设置分区、常用操作，输入时还能搜索账号直达详情。 */
export function CommandPalette() {
  const open = useCommandPaletteOpen()
  const navigate = useNavigate()
  const accounts = useAccounts()
  const keys = useApiKeys()
  const server = useServerStatus()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listId = useId()

  const go = (path: string) => requestLeave(() => navigate(path))

  const copyEnv = async () => {
    const key = keys.data?.find((item) => item.enabled) ?? keys.data?.[0]
    if (!key) {
      toast.error(strings.overview.noKeys)
      return
    }
    try {
      const secret = await ipc.getApiKeySecret(key.id)
      const status = server.data
      const baseUrl = status?.baseUrl || `http://${status?.host ?? "127.0.0.1"}:${status?.port ?? 5678}`
      await navigator.clipboard.writeText(
        `export ANTHROPIC_BASE_URL="${baseUrl}"\nexport ANTHROPIC_API_KEY="${secret}"`,
      )
      toast.success(strings.overview.envCopied)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const commands: Command[] = [
    ...mainNav.map((item, index) => ({
      id: `page:${item.value}`,
      group: strings.palette.pages,
      label: item.label,
      shortcut: `${modKeyLabel}${index + 1}`,
      run: () => go(item.value),
    })),
    { id: "page:/connect", group: strings.palette.pages, label: strings.nav.connect, run: () => go("/connect") },
    ...settingsSections.map((section) => ({
      id: `settings:${section}`,
      group: strings.palette.settings,
      label: strings.settings.sections[section],
      shortcut: section === "service" ? `${modKeyLabel},` : undefined,
      run: () => go(`/settings/${section}`),
    })),
    {
      id: "action:add-account",
      group: strings.palette.actions,
      label: strings.accounts.addAccount,
      run: () => go("/accounts?add=oauth"),
    },
    {
      id: "action:copy-env",
      group: strings.palette.actions,
      label: strings.overview.copyEnv,
      run: () => void copyEnv(),
    },
    ...(accounts.data?.credentials ?? []).map((item) => ({
      id: `account:${item.id}`,
      group: strings.palette.accounts,
      label: accountName(item),
      keywords: `${item.email ?? ""} ${item.provider ?? ""} #${item.id}`,
      run: () => go(`/accounts/${item.id}`),
    })),
  ]

  // 不输入时只列页面、设置和操作；账号要搜索才出现，避免列表太长。
  const term = query.trim().toLowerCase()
  const results = (
    term
      ? commands.filter((command) =>
          `${command.label} ${command.keywords ?? ""} ${command.group}`.toLowerCase().includes(term),
        )
      : commands.filter((command) => command.group !== strings.palette.accounts)
  ).slice(0, MAX_RESULTS)
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0))

  const close = () => {
    setCommandPaletteOpen(false)
    setQuery("")
    setActive(0)
  }

  const runCommand = (command: Command | undefined) => {
    if (!command) return
    close()
    command.run()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive(Math.min(activeIndex + 1, results.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      runCommand(results[activeIndex])
    }
  }

  const optionId = (index: number) => `${listId}-${index}`

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setCommandPaletteOpen(true) : close())}>
      <DialogContent
        showCloseButton={false}
        className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <DialogTitle className="sr-only">{strings.palette.title}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <SearchIcon className="size-4 shrink-0 text-faint" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={strings.palette.placeholder}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
            aria-label={strings.palette.title}
            className="h-12 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </div>
        <ul id={listId} role="listbox" aria-label={strings.palette.title} className="max-h-[360px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li role="presentation" className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
              {strings.palette.empty}
            </li>
          ) : null}
          {results.map((command, index) => (
            <li key={command.id} role="presentation">
              {index === 0 || results[index - 1].group !== command.group ? (
                <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-faint">{command.group}</div>
              ) : null}
              <div
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onMouseMove={() => setActive(index)}
                onClick={() => runCommand(command)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-[12.5px]",
                  index === activeIndex && "bg-nav-active",
                )}
              >
                <span className="min-w-0 truncate">{command.label}</span>
                {command.shortcut ? (
                  <kbd className="shrink-0 font-mono text-[11px] text-faint">{command.shortcut}</kbd>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
