import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowDownIcon,
  CopyIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
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

/** 等级从低到高；筛选某一级时显示这一级及更严重的日志（选 WARN 也能看到 ERROR）。 */
const LEVEL_RANK: Record<string, number> = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 }

function passesLevel(level: string, filter: LevelFilter): boolean {
  if (filter === "ALL") return true
  return (LEVEL_RANK[level] ?? LEVEL_RANK.INFO) >= LEVEL_RANK[filter]
}

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

/** 一行日志；点击（或回车）在下方详情区展开完整内容。 */
function LogRow({
  entry,
  selected,
  onSelect,
}: {
  entry: LogEntry
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex h-full w-full items-start gap-3 px-3 text-left font-mono text-[12px] leading-[22px] outline-none hover:bg-subtle focus-visible:bg-nav-active",
        selected && "bg-nav-active",
      )}
    >
      <span className="num shrink-0 text-muted-foreground">{fmtLogTime(entry.timestamp)}</span>
      <span className={cn("w-11 shrink-0 font-semibold", levelTone(entry.level))}>{entry.level}</span>
      <span className="w-[176px] shrink-0 truncate text-muted-foreground">{shortTarget(entry.target)}</span>
      <span className="min-w-0 flex-1 truncate">{entry.message}</span>
    </button>
  )
}

/** 选中日志的完整内容：时间、等级、target 与不截断的消息，可以复制。 */
function LogDetail({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${entry.timestamp} ${entry.level} ${entry.target} ${entry.message}`,
      )
      toast.success(strings.logs.copied)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  return (
    <section
      aria-label={strings.logs.detailTitle}
      className="flex shrink-0 flex-col gap-2 rounded-[16px] border border-border bg-card p-3"
    >
      <div className="flex items-center gap-3 font-mono text-[11.5px] text-muted-foreground">
        <span className="num">{fmtLogTime(entry.timestamp)}</span>
        <span className={cn("font-semibold", levelTone(entry.level))}>{entry.level}</span>
        <span className="min-w-0 flex-1 truncate">{entry.target}</span>
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          <CopyIcon />
          {strings.common.copy}
        </Button>
        <Button variant="icon" size="icon" aria-label={strings.common.close} onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <pre className="max-h-40 overflow-y-auto font-mono text-[12px] leading-5 break-all whitespace-pre-wrap">
        {entry.message}
      </pre>
    </section>
  )
}

function RuntimeLog({ active }: { active: boolean }) {
  const { entries, clear } = useLogStream()
  const [level, setLevel] = useState<LevelFilter>("ALL")
  const [search, setSearch] = useState("")
  const [follow, setFollow] = useState(true)
  const [frozen, setFrozen] = useState<LogEntry[] | null>(null)
  const [manualPause, setManualPause] = useState(false)
  const [selected, setSelected] = useState<LogEntry | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 滚动监听只挂一次，通过 ref 读最新值（在提交后同步，不在渲染期间写 ref）。
  const live = useRef({ entries, manualPause, follow, frozen, scrollTop: 0 })
  useLayoutEffect(() => {
    live.current.entries = entries
    live.current.manualPause = manualPause
    live.current.follow = follow
    live.current.frozen = frozen
  })

  // 冻结时（手动暂停或往上翻看）列表保持不动，新日志在后台继续累积；缓冲满 1000 条后
  // 不冻结的话旧日志会被挤掉，正在看的内容会在视口里不断上移。
  const source = frozen ?? entries
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return source.filter((entry) => {
      if (!passesLevel(entry.level, level)) return false
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

  // 往上翻时停止跟随并冻结列表；翻回底部时（不是手动暂停的话）恢复实时滚动。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      // 页签隐藏时元素没有高度，这时的滚动事件不代表用户操作。
      if (el.clientHeight === 0) return
      live.current.scrollTop = el.scrollTop
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * 2
      setFollow(atBottom)
      if (!atBottom) setFrozen((current) => current ?? live.current.entries)
      else if (!live.current.manualPause) setFrozen(null)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  // 切回运行日志页签时恢复位置：跟随中就滚到最新，否则回到离开时看的位置。
  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      if (live.current.follow && !live.current.frozen) {
        virtualizer.scrollToIndex(Math.max(0, virtualizer.options.count - 1), { align: "end" })
      } else {
        el.scrollTop = live.current.scrollTop
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [active, virtualizer])

  const lastFrozenSeq = frozen && frozen.length > 0 ? frozen[frozen.length - 1].seq : 0
  const pendingWhilePaused = frozen ? entries.filter((entry) => entry.seq > lastFrozenSeq).length : 0

  const resume = () => {
    setManualPause(false)
    setFrozen(null)
    setFollow(true)
  }

  const togglePause = () => {
    if (frozen) {
      resume()
    } else {
      setManualPause(true)
      setFrozen(entries)
    }
  }

  const jumpLatest = () => {
    resume()
    // 下一帧列表已解冻、筛选结果已更新，按当前行数滚到底。
    requestAnimationFrame(() =>
      virtualizer.scrollToIndex(Math.max(0, virtualizer.options.count - 1), { align: "end" }),
    )
  }

  const confirmClear = async () => {
    try {
      await ipc.clearLogs()
      clear()
      setFrozen(null)
      setManualPause(false)
      setSelected(null)
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
            <ToggleGroupItem
              key={item}
              value={item}
              aria-label={item === "ALL" ? strings.logs.allLevels : strings.logs.levelAtLeast(item)}
              title={item === "ALL" ? undefined : strings.logs.levelAtLeast(item)}
            >
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
              {virtualizer.getVirtualItems().map((item) => {
                const entry = filtered[item.index]
                return (
                  <div
                    key={item.key}
                    className="absolute top-0 left-0 w-full"
                    style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  >
                    <LogRow
                      entry={entry}
                      selected={selected?.seq === entry.seq}
                      onSelect={() => setSelected((current) => (current?.seq === entry.seq ? null : entry))}
                    />
                  </div>
                )
              })}
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

      {selected ? <LogDetail entry={selected} onClose={() => setSelected(null)} /> : null}

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
        {/* 运行日志保持挂载：切到其他页签再回来，筛选、暂停和日志流都还在 */}
        <TabsContent value="runtime" keepMounted className="flex min-h-0 flex-col">
          <RuntimeLog active={tab === "runtime"} />
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
