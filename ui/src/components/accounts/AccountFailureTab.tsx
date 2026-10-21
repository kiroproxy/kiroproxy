import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDateTime } from "@/lib/format"
import { useFailureLogs } from "@/lib/queries"
import { strings } from "@/lib/strings"

export function AccountFailureTab({ id }: { id: number }) {
  const logs = useFailureLogs(id)
  const records = logs.data?.records ?? []

  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{strings.logs.columns.time}</TableHead>
            <TableHead>{strings.logs.columns.endpoint}</TableHead>
            <TableHead>{strings.logs.columns.status}</TableHead>
            <TableHead>{strings.accounts.errorColumn}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.isLoading ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {strings.common.loading}
              </TableCell>
            </TableRow>
          ) : null}
          {!logs.isLoading && records.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {strings.accounts.noRecords}
              </TableCell>
            </TableRow>
          ) : null}
          {records.map((record, index) => (
            <TableRow key={`${record.createdAt}-${index}`}>
              <TableCell className="num text-muted-foreground">
                {fmtDateTime(record.createdAt)}
              </TableCell>
              <TableCell>{record.requestType}</TableCell>
              <TableCell className="num">{record.statusCode}</TableCell>
              <TableCell className="max-w-[420px] truncate text-danger">
                {record.responseBody}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
