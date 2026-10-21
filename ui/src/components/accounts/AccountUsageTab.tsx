import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtCost, fmtDateTime, fmtDuration, fmtNumber } from "@/lib/format"
import { useCredentialTodaySummary, useCredentialUsageRecords } from "@/lib/queries"
import { strings } from "@/lib/strings"

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="num text-[15px] font-bold">{value}</div>
    </div>
  )
}

export function AccountUsageTab({ id }: { id: number }) {
  const [page, setPage] = useState(1)
  const today = useCredentialTodaySummary(id)
  const records = useCredentialUsageRecords(id, page)

  const summary = today.data
  const pageData = records.data
  const totalPages = pageData?.totalPages ?? 1

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-1 md:grid-cols-5">
          <Metric label={strings.usage.requests} value={fmtNumber(summary?.totalRequests ?? 0)} />
          <Metric label={strings.usage.inputTokens} value={fmtNumber(summary?.totalInputTokens ?? 0)} />
          <Metric label={strings.usage.outputTokens} value={fmtNumber(summary?.totalOutputTokens ?? 0)} />
          <Metric label={strings.usage.credits} value={fmtNumber(summary?.totalCredits ?? 0)} />
          <Metric label={strings.usage.cost} value={fmtCost(summary?.totalCost ?? 0)} />
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{strings.usage.columns.time}</TableHead>
              <TableHead>{strings.usage.columns.model}</TableHead>
              <TableHead>{strings.usage.columns.tokens}</TableHead>
              <TableHead>{strings.usage.columns.cost}</TableHead>
              <TableHead>{strings.usage.columns.duration}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {strings.common.loading}
                </TableCell>
              </TableRow>
            ) : null}
            {!records.isLoading && (pageData?.records.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {strings.accounts.noRecords}
                </TableCell>
              </TableRow>
            ) : null}
            {pageData?.records.map((record, index) => (
              <TableRow key={`${record.createdAt}-${index}`}>
                <TableCell className="num text-muted-foreground">
                  {fmtDateTime(record.createdAt)}
                </TableCell>
                <TableCell className="max-w-[180px] truncate font-medium">{record.model}</TableCell>
                <TableCell className="num">
                  {fmtNumber(record.inputTokens)} / {fmtNumber(record.outputTokens)} /{" "}
                  {fmtNumber(record.cacheReadInputTokens ?? 0)}
                </TableCell>
                <TableCell className="num">{fmtCost(record.estimatedCost)}</TableCell>
                <TableCell className="num text-muted-foreground">
                  {record.durationMs ? fmtDuration(record.durationMs / 1000) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 text-[12px] text-muted-foreground">
        <span className="num">{strings.common.pageOf(page, totalPages)}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          {strings.common.prevPage}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          {strings.common.nextPage}
        </Button>
      </div>
    </div>
  )
}
