import { useState } from "react"
import { ShieldCheckIcon } from "lucide-react"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LoadError } from "@/components/shell/LoadError"
import { Pager } from "@/components/shell/Pager"
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

/** 限流 / 失败日志表：分页、显示总数；不指定账号时增加账号列。 */
export function EventLogTable({ kind, credentialId }: { kind: EventLogKind; credentialId?: number }) {
  const [page, setPage] = useState(1)
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
      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
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
              : rows.map((record, index) => (
                  <TableRow key={`${record.createdAt}-${record.credentialId}-${index}`}>
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
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className={cn(
                                "block truncate font-mono text-[11.5px]",
                                kind === "failure" ? "text-text-danger" : "text-muted-foreground",
                              )}
                            />
                          }
                        >
                          {record.responseBody}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[480px] break-all whitespace-pre-wrap font-mono text-[11px]">
                          {record.responseBody}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <Pager
        page={query.data?.page ?? page}
        totalPages={query.data?.totalPages ?? 1}
        total={query.data?.total}
        onChange={setPage}
      />
    </div>
  )
}
