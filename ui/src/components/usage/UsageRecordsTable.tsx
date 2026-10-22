import { Fragment, useState } from "react"
import { ChevronRightIcon } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtCost, fmtCredits, fmtDateTime, fmtDuration, fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"
import type { UsageRecordItem } from "@/lib/types"

const headClass = "text-[12px] text-muted-foreground"

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : fmtDuration(ms / 1000)
}

/** 记录里表格放不下的字段；只列出有值的。 */
function recordDetails(record: UsageRecordItem): { label: string; value: string }[] {
  const labels = strings.usage.detail
  const items: { label: string; value: string | null }[] = [
    { label: labels.firstToken, value: record.firstTokenMs != null ? fmtMs(record.firstTokenMs) : null },
    { label: labels.stream, value: record.isStream == null ? null : record.isStream ? strings.common.yes : strings.common.no },
    { label: labels.thinkingTokens, value: record.thinkingTokenCount ? fmtNumber(record.thinkingTokenCount) : null },
    { label: labels.cacheWrite, value: record.cacheCreationInputTokens ? fmtNumber(record.cacheCreationInputTokens) : null },
    { label: labels.creditsSaved, value: record.creditsSaved ? fmtCredits(record.creditsSaved) : null },
    { label: labels.effort, value: record.effort || null },
    { label: labels.clientIp, value: record.clientIp || null },
    { label: labels.userAgent, value: record.userAgent || null },
  ]
  return items.filter((item): item is { label: string; value: string } => item.value !== null)
}

/** 调用记录表；行 key 由时间、模型和序号组成（后端记录没有独立 id）。点时间展开这条记录的更多信息。 */
export function UsageRecordsTable({
  records,
  showAccount = true,
}: {
  records: UsageRecordItem[]
  showAccount?: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const columns = showAccount ? 9 : 8

  return (
    <div className="overflow-clip rounded-[16px] border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="h-10 hover:bg-transparent">
            <TableHead className={headClass}>{strings.usage.columns.time}</TableHead>
            {showAccount ? <TableHead className={headClass}>{strings.usage.columns.account}</TableHead> : null}
            <TableHead className={headClass}>{strings.usage.columns.model}</TableHead>
            <TableHead className={`${headClass} text-right`}>{strings.usage.inputTokens}</TableHead>
            <TableHead className={`${headClass} text-right`}>{strings.usage.outputTokens}</TableHead>
            <TableHead className={`${headClass} text-right`}>{strings.usage.cacheRead}</TableHead>
            <TableHead className={`${headClass} text-right`}>{strings.usage.columns.cost}</TableHead>
            <TableHead className={`${headClass} text-right`}>{strings.usage.columns.credits}</TableHead>
            <TableHead className={`${headClass} text-right`}>{strings.usage.columns.duration}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => {
            const key = `${record.createdAt}-${record.model}-${index}`
            const open = expanded === key
            const details = open ? recordDetails(record) : []
            return (
              <Fragment key={key}>
                <TableRow data-state={open ? "selected" : undefined}>
                  <TableCell className="num text-muted-foreground">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : key)}
                      className="flex items-center gap-1 rounded-[6px] outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary/60"
                    >
                      <ChevronRightIcon
                        className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
                        aria-hidden="true"
                      />
                      {fmtDateTime(record.createdAt)}
                    </button>
                  </TableCell>
                  {showAccount ? (
                    <TableCell className="max-w-[140px] truncate">
                      {record.credentialLabel ?? strings.usage.noAccount}
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-[200px] truncate font-medium">{record.model}</TableCell>
                  <TableCell className="num text-right">{fmtNumber(record.inputTokens)}</TableCell>
                  <TableCell className="num text-right">{fmtNumber(record.outputTokens)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {fmtNumber(record.cacheReadInputTokens ?? 0)}
                  </TableCell>
                  <TableCell className="num text-right">{fmtCost(record.estimatedCost)}</TableCell>
                  <TableCell className="num text-right">{fmtCredits(record.creditsUsed ?? 0)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {record.durationMs ? fmtDuration(record.durationMs / 1000) : "—"}
                  </TableCell>
                </TableRow>
                {open ? (
                  <TableRow className="h-auto hover:bg-transparent">
                    <TableCell colSpan={columns} className="bg-subtle/40 whitespace-normal">
                      {details.length === 0 ? (
                        <p className="py-1 text-[12px] text-muted-foreground">{strings.usage.detail.none}</p>
                      ) : (
                        <dl className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-2 py-1 text-[12px]">
                          {details.map((item) => (
                            <div key={item.label} className="min-w-0">
                              <dt className="text-[11.5px] text-muted-foreground">{item.label}</dt>
                              <dd className="num font-medium break-all">{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
