import { Fragment, useState } from "react"
import { ChevronRightIcon, CopyIcon, ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LoadError } from "@/components/shell/LoadError"
import { Pager } from "@/components/shell/Pager"
import { errorMessage } from "@/lib/ipc"
import { fmtDateTime } from "@/lib/format"
import { useAccounts, useFailureLogs, useThrottleLogs } from "@/lib/queries"
import { strings } from "@/lib/strings"
import { accountName } from "@/lib/account-status"
import { cn } from "@/lib/utils"

export type EventLogKind = "throttle" | "failure"

interface EventRow {
  credentialId: number
  createdAt: string
  statusCode: number
  responseBody: string
  endpoint?: string | null
  requestType: string
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(strings.common.copied)
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

/** 限流 / 失败日志表：分页、显示总数；不指定账号时增加账号列。点原因 / 错误展开完整响应体。 */
export function EventLogTable({ kind, credentialId }: { kind: EventLogKind; credentialId?: number }) {
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const throttle = useThrottleLogs(credentialId, page)
  const failure = useFailureLogs(credentialId, page)
  const query = kind === "throttle" ? throttle : failure
  const accounts = useAccounts()
  const showAccount = credentialId === undefined
  const names = new Map((accounts.data?.credentials ?? []).map((item) => [item.id, accountName(item)]))

  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />

  const rows = (query.data?.records ?? []) as EventRow[]
  const columns = showAccount ? 5 : 4

  if (!query.isLoading && rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldCheckIcon />
          </EmptyMedia>
          <EmptyTitle>{strings.logs.empty}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-clip rounded-[16px] border border-border bg-card">
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[168px]" />
            {showAccount ? <col className="w-[140px]" /> : null}
            <col className="w-[210px]" />
            <col className="w-[64px]" />
            <col />
          </colgroup>
          <TableHeader>
            <TableRow className="h-10 hover:bg-transparent">
              <TableHead className="text-[12px] text-muted-foreground">
                {strings.logs.columns.time}
              </TableHead>
              {showAccount ? (
                <TableHead className="text-[12px] text-muted-foreground">
                  {strings.logs.account}
                </TableHead>
              ) : null}
              <TableHead className="text-[12px] text-muted-foreground">
                {strings.logs.columns.endpoint}
              </TableHead>
              <TableHead className="text-[12px] text-muted-foreground">
                {strings.logs.columns.status}
              </TableHead>
              <TableHead className="text-[12px] text-muted-foreground">
                {kind === "throttle" ? strings.logs.columns.reason : strings.accounts.errorColumn}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading
              ? Array.from({ length: 4 }, (_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={columns}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((record, index) => {
                  const key = `${page}-${record.createdAt}-${record.credentialId}-${index}`
                  const open = expanded === key
                  return (
                    <Fragment key={key}>
                      <TableRow data-state={open ? "selected" : undefined}>
                        <TableCell className="num text-muted-foreground">
                          {fmtDateTime(record.createdAt)}
                        </TableCell>
                        {showAccount ? (
                          <TableCell className="truncate">
                            {names.get(record.credentialId) ?? `#${record.credentialId}`}
                          </TableCell>
                        ) : null}
                        <TableCell className="truncate font-mono text-[11.5px]">
                          {record.endpoint ?? record.requestType}
                        </TableCell>
                        <TableCell className="num">{record.statusCode}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : key)}
                            className={cn(
                              "flex w-full min-w-0 items-center gap-1 rounded-[6px] text-left font-mono text-[11.5px] outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary/60",
                              kind === "failure" ? "text-text-danger" : "text-muted-foreground",
                            )}
                          >
                            <ChevronRightIcon
                              className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 truncate">{record.responseBody}</span>
                          </button>
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="h-auto hover:bg-transparent">
                          <TableCell colSpan={columns} className="bg-subtle/40 whitespace-normal">
                            <div className="flex items-start gap-2 py-1">
                              <pre className="max-h-48 min-w-0 flex-1 overflow-auto font-mono text-[11.5px] leading-5 break-all whitespace-pre-wrap">
                                {record.responseBody}
                              </pre>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void copyText(record.responseBody)}
                              >
                                <CopyIcon />
                                {strings.common.copy}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
          </TableBody>
        </Table>
      </div>
      <Pager
        page={query.data?.page ?? page}
        totalPages={query.data?.totalPages ?? 1}
        total={query.data?.total}
        onChange={(next) => {
          setExpanded(null)
          setPage(next)
        }}
      />
    </div>
  )
}
