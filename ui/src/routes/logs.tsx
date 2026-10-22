import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDownIcon, DownloadIcon, PauseIcon, PlayIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EventLogTable } from "@/components/logs/EventLogTable"
import { usePageHeader } from "@/components/shell/page-header"
import { errorMessage, ipc } from "@/lib/ipc"
import { fmtLogTime } from "@/lib/format"
import { useLogStream } from "@/lib/log-stream"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"
import type { LogEntry, LogKind } from "@/lib/types"

const LEVELS = ["ALL", "ERROR", "WARN", "INFO", "DEBUG"] as const
type LevelFilter = (typeof LEVELS)[number]
const ROW_HEIGHT = 22

function levelTone(level: string): string {
  if (level === "ERROR") return "text-text-danger"
  if (level === "WARN") return "text-text-warning"
  if (level === "DEBUG" || level === "TRACE") return "text-muted-foreground"
  return "text-text-info"
}

/** 去掉 crate 前缀，`kiro_core::kiro::provider` → `kiro::provider`。 */
function shortTarget(target: string): string {
  return target.replace(/^kiro_core::/, "").replace(/^kiroproxy_app::/, "app::")
}

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex h-full items-start gap-3 px-3 font-mono text-[12px] leading-[22px]">
      <span className="num shrink-0 text-muted-foreground">{fmtLogTime(entry.timestamp)}</span>
      <span className={cn("w-11 shrink-0 font-semibold", levelTone(entry.level))}>{entry.level}</span>
      <span className="w-[176px] shrink-0 truncate text-muted-foreground" title={entry.target}>
        {shortTarget(entry.target)}
      </span>
      <span className="min-w-0 flex-1 truncate" title={entry.message}>
        {entry.message}
      </span>
    </div>
  )
}

function RuntimeLog() {
  const { entries, clear } = useLogStream()
  const [level, setLevel] = useState<LevelFilter>("ALL")
  const [search, setSearch] = useState("")
  const [follow, setFollow] = useState(true)
  const [frozen, setFrozen] = useState<LogEntry[] | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 暂停时冻结当前列表，新日志在后台继续累积。
  const source = frozen ?? entries
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return source.filter((entry) => {
      if (level !== "ALL" && entry.level !== level) return false
      if (!term) return true
      return `${entry.target} ${entry.message}`.toLowerCase().includes(term)
    })
  }, [source, level, search])

  // TanStack Virtual 返回的实例不可被 React Compiler 记忆化；本项目未启用 Compiler，可以忽略该提示。
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
    getItemKey: (index) => filtered[index].seq,
  })

  useLayoutEffect(() => {
    if (follow && !frozen && filtered.length > 0) {
      virtualizer.scrollToIndex(filtered.length - 1, { align: "end" })
    }
  }, [filtered.length, follow, frozen, virtualizer])

  // 用户往上翻时停止跟随，回到底部时恢复。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * 2
      setFollow(atBottom)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  const pendingWhilePaused = frozen ? Math.max(0, entries.length - frozen.length) : 0

  const togglePause = () => {
    if (frozen) {
      setFrozen(null)
      setFollow(true)
    } else {
      setFrozen(entries)
    }
  }

  const jumpLatest = () => {
    setFrozen(null)
    setFollow(true)
    requestAnimationFrame(() => virtualizer.scrollToIndex(filtered.length - 1, { align: "end" }))
  }

  const confirmClear = async () => {
    try {
      await ipc.clearLogs()
      clear()
      setFrozen(null)
      setClearOpen(false)
      toast.success(strings.logs.cleared)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          variant="filter"
          value={[level]}
          onValueChange={(next) => {
            if (next[0]) setLevel(next[0] as LevelFilter)
          }}
          aria-label={strings.logs.levelLabel}
        >
          {LEVELS.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {item === "ALL" ? strings.logs.allLevels : item}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <Input
            value={search}
            placeholder={strings.logs.searchPlaceholder}
            aria-label={strings.logs.searchPlaceholder}
            className="w-[220px] rounded-full pl-8"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="num text-[11.5px] text-muted-foreground">
          {strings.logs.shown(filtered.length, source.length)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={togglePause}>
            {frozen ? <PlayIcon /> : <PauseIcon />}
            {frozen ? strings.logs.resume : strings.logs.pause}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void exportLog("runtime")}>
            <DownloadIcon />
            {strings.logs.export}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setClearOpen(true)}>
            <Trash2Icon />
            {strings.logs.clear}
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-border bg-card">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-1" role="log" aria-live="off">
          {filtered.length === 0 ? (
            <div className="grid h-full place-items-center text-[12.5px] text-muted-foreground">
              {strings.logs.empty}
            </div>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => (
                <div
                  key={item.key}
                  className="absolute top-0 left-0 w-full hover:bg-subtle"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  <LogRow entry={filtered[item.index]} />
                </div>
              ))}
            </div>
          )}
        </div>

        {frozen || !follow ? (
          <Button
            variant="capsule"
            size="sm"
            className="absolute right-4 bottom-3"
            onClick={jumpLatest}
          >
            <ArrowDownIcon />
            {frozen && pendingWhilePaused > 0 ? strings.logs.paused(pendingWhilePaused) : strings.logs.jumpLatest}
          </Button>
        ) : null}
      </div>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.logs.clearTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.logs.clearConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.common.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => void confirmClear()}>
              {strings.common.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

async function exportLog(kind: LogKind) {
  try {
    const path = await ipc.exportLogs(kind)
    if (path) toast.success(strings.logs.exported, { description: path })
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

export function LogsPage() {
  const [tab, setTab] = useState<"runtime" | LogKind>("runtime")

  usePageHeader(
    {
      actions:
        tab === "runtime" ? null : (
          <Button variant="secondary" onClick={() => void exportLog(tab)}>
            <DownloadIcon />
            {strings.logs.export}
          </Button>
        ),
    },
    [tab],
  )

  return (
    <section aria-label={strings.logs.title} className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="min-h-0 flex-1 gap-3"
      >
        <TabsList>
          <TabsTrigger value="runtime">{strings.logs.runtime}</TabsTrigger>
          <TabsTrigger value="throttle">{strings.logs.throttle}</TabsTrigger>
          <TabsTrigger value="failure">{strings.logs.failure}</TabsTrigger>
        </TabsList>
        <TabsContent value="runtime" className="flex min-h-0 flex-col">
          <RuntimeLog />
        </TabsContent>
        <TabsContent value="throttle" className="min-h-0 overflow-y-auto">
          <EventLogTable kind="throttle" />
        </TabsContent>
        <TabsContent value="failure" className="min-h-0 overflow-y-auto">
          <EventLogTable kind="failure" />
        </TabsContent>
      </Tabs>
    </section>
  )
}
