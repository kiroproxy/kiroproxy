import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtCost, fmtCredits, fmtDateTime, fmtDuration, fmtNumber } from "@/lib/format"
import { strings } from "@/lib/strings"
import type { UsageRecordItem } from "@/lib/types"

const headClass = "text-[12px] text-muted-foreground"

/** 调用记录表；行 key 由时间、模型和序号组成（后端记录没有独立 id）。 */
export function UsageRecordsTable({
  records,
  showAccount = true,
}: {
  records: UsageRecordItem[]
  showAccount?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card">
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
          {records.map((record, index) => (
            <TableRow key={`${record.createdAt}-${record.model}-${index}`}>
              <TableCell className="num text-muted-foreground">{fmtDateTime(record.createdAt)}</TableCell>
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
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
