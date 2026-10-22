import { useState } from "react"
import { ReceiptTextIcon } from "lucide-react"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { LoadError } from "@/components/shell/LoadError"
import { Pager } from "@/components/shell/Pager"
import { UsageRecordsTable } from "@/components/usage/UsageRecordsTable"
import { useCredentialUsageRecords } from "@/lib/queries"
import { strings } from "@/lib/strings"

export function AccountUsageTab({ id }: { id: number }) {
  const [page, setPage] = useState(1)
  const records = useCredentialUsageRecords(id, page)

  if (records.isError) return <LoadError error={records.error} onRetry={() => void records.refetch()} />
  if (records.isLoading) return <Skeleton className="h-40 w-full rounded-[16px]" />

  const data = records.data
  if (!data || data.records.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ReceiptTextIcon />
          </EmptyMedia>
          <EmptyTitle>{strings.accounts.noRecords}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col">
      <UsageRecordsTable records={data.records} showAccount={false} />
      <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
    </div>
  )
}
