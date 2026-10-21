import { useEffect, useMemo, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { save } from "@tauri-apps/plugin-dialog"
import { DownloadIcon, PauseIcon, PlayIcon, Trash2Icon } from "lucide-react"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ipc } from "@/lib/ipc"
import { fmtDateTime } from "@/lib/format"
import { useFailureLogs, useThrottleLogs } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { LogEntry } from "@/lib/types"

const MAX_ENTRIES = 1000
const LEVELS = ["全部", "INFO", "WARN", "ERROR", "DEBUG"] as const

function levelTone(level: string): string {
  if (level === "ERROR") return "text-text-danger"
  if (level === "WARN") return "text-text-warning"
  if (level === "DEBUG") return "text-faint"
  return "text-text-info"
}

export function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("全部")
  const [search, setSearch] = useState("")
  const [paused, setPaused] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const throttle = useThrottleLogs()
  const failure = useFailureLogs()

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void (async () => {
      try {
        const snapshot = await ipc.getLogSnapshot()
        if (!disposed) setEntries(snapshot.slice(-MAX_ENTRIES))
      } catch {
        // 启动早期日志可能尚未就绪，事件会继续补齐。
      }
      try {
        unlisten = await listen<LogEntry>("log://entry", (event) => {
          if (disposed) return
          setEntries((prev) => {
            const next = [...prev, event.payload]
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
          })
        })
      } catch {
        // 非 Tauri 环境（测试/浏览器预览）没有事件桥。
      }
    })()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ block: "end" })
  }, [entries, paused])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return entries.filter((entry) => {
      if (level !== "全部" && entry.level !== level) return false
      if (!term) return true
      return `${entry.target} ${entry.message}`.toLowerCase().includes(term)
    })
  }, [entries, level, search])

  const handleDownload = async () => {
    try {
      const path = await save({
        defaultPath: "kiroproxy-runtime.log",
        filters: [{ name: "Log", extensions: ["log", "txt"] }],
      })
      if (!path) return
      await ipc.exportLogs("runtime", path)
      toast.success("日志已导出")
    } catch (error) {
      toast.error((error as { message?: string }).message ?? strings.errors.actionFailed)
    }
  }

  const handleClear = () => setClearOpen(true)

  const confirmClear = async () => {
    try {
      await ipc.clearLogs()
      setEntries([])
      setClearOpen(false)
    } catch (error) {
      toast.error((error as { message?: string }).message ?? strings.errors.actionFailed)
    }
  }

  return (
    <section aria-label={strings.logs.title} className="flex min-h-0 flex-1 flex-col gap-3">
      <Tabs defaultValue="runtime" className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="runtime">{strings.logs.runtime}</TabsTrigger>
            <TabsTrigger value="throttle">{strings.logs.throttle}</TabsTrigger>
            <TabsTrigger value="failure">{strings.logs.failure}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="runtime" className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={level} onValueChange={(value) => setLevel(String(value) as typeof level)}>
              <TabsList>
                {LEVELS.map((item) => (
                  <TabsTrigger key={item} value={item}>
                    {item}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Input
              value={search}
              placeholder={strings.logs.searchPlaceholder}
              className="max-w-[240px]"
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setPaused((value) => !value)}>
                {paused ? <PlayIcon /> : <PauseIcon />}
                {paused ? strings.logs.resume : strings.logs.pause}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleDownload}>
                <DownloadIcon />
                {strings.logs.export}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleClear}>
                <Trash2Icon />
                {strings.logs.clear}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-[16px] border border-border bg-card p-3 font-mono text-[12px] leading-5">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">{strings.logs.empty}</div>
            ) : null}
            {filtered.map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`} className="flex gap-2 border-b border-border/40 py-0.5 last:border-0">
                <span className="num shrink-0 text-faint">{entry.timestamp.slice(11, 23)}</span>
                <span className={`w-10 shrink-0 font-semibold ${levelTone(entry.level)}`}>
                  {entry.level}
                </span>
                <span className="shrink-0 text-muted-foreground">{entry.target}</span>
                <span className="min-w-0 break-all">{entry.message}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </TabsContent>

        <TabsContent value="throttle">
          <div className="overflow-hidden rounded-[16px] border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{strings.logs.columns.time}</TableHead>
                  <TableHead>账号</TableHead>
                  <TableHead>{strings.logs.columns.endpoint}</TableHead>
                  <TableHead>{strings.logs.columns.status}</TableHead>
                  <TableHead>{strings.logs.columns.reason}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(throttle.data?.records ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {strings.logs.empty}
                    </TableCell>
                  </TableRow>
                ) : null}
                {(throttle.data?.records ?? []).map((record, index) => (
                  <TableRow key={`${record.createdAt}-${index}`}>
                    <TableCell className="num text-muted-foreground">
                      {fmtDateTime(record.createdAt)}
                    </TableCell>
                    <TableCell className="num">#{record.credentialId}</TableCell>
                    <TableCell>{record.endpoint ?? record.requestType}</TableCell>
                    <TableCell className="num">{record.statusCode}</TableCell>
                    <TableCell className="max-w-[420px] truncate text-muted-foreground">
                      {record.responseBody}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="failure">
          <div className="overflow-hidden rounded-[16px] border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{strings.logs.columns.time}</TableHead>
                  <TableHead>账号</TableHead>
                  <TableHead>{strings.logs.columns.endpoint}</TableHead>
                  <TableHead>{strings.logs.columns.status}</TableHead>
                  <TableHead>{strings.accounts.errorColumn}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(failure.data?.records ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {strings.logs.empty}
                    </TableCell>
                  </TableRow>
                ) : null}
                {(failure.data?.records ?? []).map((record, index) => (
                  <TableRow key={`${record.createdAt}-${index}`}>
                    <TableCell className="num text-muted-foreground">
                      {fmtDateTime(record.createdAt)}
                    </TableCell>
                    <TableCell className="num">#{record.credentialId}</TableCell>
                    <TableCell>{record.requestType}</TableCell>
                    <TableCell className="num">{record.statusCode}</TableCell>
                    <TableCell className="max-w-[420px] truncate text-text-danger">
                      {record.responseBody}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.logs.clear}</AlertDialogTitle>
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
    </section>
  )
}
