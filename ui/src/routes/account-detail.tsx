import { useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { PencilIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QuotaRing } from "@/components/charts/QuotaRing"
import { AccountInfoCard } from "@/components/accounts/AccountInfoCard"
import { AccountUsageTab } from "@/components/accounts/AccountUsageTab"
import { EditAccountDialog } from "@/components/accounts/EditAccountDialog"
import { EventLogTable } from "@/components/logs/EventLogTable"
import { LoadError } from "@/components/shell/LoadError"
import { usePageHeader } from "@/components/shell/page-header"
import { accountName, accountStatus, hasQuota } from "@/lib/account-status"
import { errorMessage, ipc } from "@/lib/ipc"
import { fmtCost, fmtCredits, fmtDateTime, fmtNumber } from "@/lib/format"
import {
  queryKeys,
  useAccountBalance,
  useAccountModels,
  useAccounts,
  useCredentialTodaySummary,
} from "@/lib/queries"
import { strings } from "@/lib/strings"

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  )
}

function BalanceCard({ id }: { id: number }) {
  const balance = useAccountBalance(id)
  const data = balance.data

  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <CardTitle>{strings.accounts.balanceTitle}</CardTitle>
        <CardDescription>{strings.accounts.quotaHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-5">
        {balance.isLoading ? (
          <Skeleton className="size-[112px] shrink-0 rounded-full" />
        ) : (
          <QuotaRing size={112} percent={hasQuota(data) ? data.usagePercentage : 0} />
        )}
        <div className="min-w-0 flex-1 space-y-2 text-[12px]">
          {balance.isError ? (
            <p className="text-text-danger">{errorMessage(balance.error)}</p>
          ) : !balance.isLoading && !hasQuota(data) ? (
            <p className="text-muted-foreground">{strings.accounts.quotaUnsupported}</p>
          ) : (
            <>
              <Stat label={strings.accounts.subscription} value={data?.subscriptionTitle ?? "—"} />
              <Stat
                label={strings.accounts.currentUsage}
                value={`${fmtNumber(Math.round(data?.currentUsage ?? 0))} / ${fmtNumber(Math.round(data?.usageLimit ?? 0))}`}
              />
              <Stat label={strings.accounts.remaining} value={fmtNumber(Math.round(data?.remaining ?? 0))} />
              <Stat
                label={strings.accounts.resetAt}
                value={data?.nextResetAt ? fmtDateTime(new Date(data.nextResetAt * 1000).toISOString()) : "—"}
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TodayCard({ id }: { id: number }) {
  const today = useCredentialTodaySummary(id)
  const data = today.data
  const items = [
    { label: strings.usage.requests, value: fmtNumber(data?.totalRequests ?? 0) },
    { label: strings.usage.inputTokens, value: fmtNumber(data?.totalInputTokens ?? 0) },
    { label: strings.usage.outputTokens, value: fmtNumber(data?.totalOutputTokens ?? 0) },
    { label: strings.usage.credits, value: fmtCredits(data?.totalCredits ?? 0) },
    { label: strings.usage.cost, value: fmtCost(data?.totalCost ?? 0) },
  ]
  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <CardTitle>{strings.accounts.todayUsage}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-x-4 gap-y-3 md:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <div className="text-[11.5px] text-muted-foreground">{item.label}</div>
            {today.isLoading ? (
              <Skeleton className="mt-1 h-5 w-14" />
            ) : (
              <div className="num truncate text-[15px] font-semibold">{item.value}</div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ModelsCard({ id }: { id: number }) {
  const models = useAccountModels(id)
  const items = models.data?.slice(0, 10) ?? []

  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <CardTitle>{strings.accounts.modelsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1.5">
        {models.isLoading
          ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[22px] w-24 rounded-full" />)
          : null}
        {models.isError ? (
          <span className="text-[12px] text-text-danger">{errorMessage(models.error)}</span>
        ) : null}
        {!models.isLoading && !models.isError && items.length === 0 ? (
          <span className="text-[12px] text-muted-foreground">{strings.accounts.noModels}</span>
        ) : null}
        {items.map((model) => (
          <Badge key={model.id} variant="neutral" className="max-w-full truncate" title={model.id}>
            {model.displayName || model.id}
          </Badge>
        ))}
        {(models.data?.length ?? 0) > items.length ? (
          <span className="num self-center text-[11.5px] text-muted-foreground">
            +{(models.data?.length ?? 0) - items.length}
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function AccountDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const accounts = useAccounts()
  const balance = useAccountBalance(id)
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const item = useMemo(
    () => accounts.data?.credentials.find((credential) => credential.id === id),
    [accounts.data, id],
  )
  const status = item ? accountStatus(item, balance.data) : null

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // 刷新时绕过后端 5 分钟余额缓存，拿到最新额度。
      const fresh = await ipc.getAccountBalance(id, true)
      queryClient.setQueryData(queryKeys.balance(id), fresh)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accountModels(id) }),
        queryClient.invalidateQueries({ queryKey: ["credentialUsage", id] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.credentialToday(id) }),
        queryClient.invalidateQueries({ queryKey: ["throttleLogs", id] }),
        queryClient.invalidateQueries({ queryKey: ["failureLogs", id] }),
      ])
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setRefreshing(false)
    }
  }

  usePageHeader(
    {
      title: item ? accountName(item) : strings.accounts.details,
      back: "/accounts",
      badges: item ? (
        <>
          {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
          {item.isCurrent ? <Badge variant="info">{strings.status.current}</Badge> : null}
        </>
      ) : null,
      actions: item ? (
        <>
          <Button variant="secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
            <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} />
            {strings.common.refresh}
          </Button>
          <Button onClick={() => setEditOpen(true)}>
            <PencilIcon />
            {strings.common.edit}
          </Button>
        </>
      ) : null,
    },
    [item, status?.label, status?.variant, refreshing],
  )

  if (accounts.isError) {
    return <LoadError error={accounts.error} onRetry={() => void accounts.refetch()} />
  }
  if (!item) {
    return accounts.isLoading ? (
      <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <Skeleton className="h-72 rounded-[16px]" />
        <Skeleton className="h-72 rounded-[16px]" />
      </div>
    ) : (
      <LoadError error={new Error(strings.accounts.emptyFiltered)} />
    )
  }

  return (
    <section aria-label={strings.accounts.details} className="flex flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <AccountInfoCard item={item} />
        <div className="flex flex-col gap-3">
          <BalanceCard id={id} />
          <ModelsCard id={id} />
        </div>
      </div>

      <TodayCard id={id} />

      <Tabs defaultValue="usage" className="gap-3 pt-1">
        <TabsList>
          <TabsTrigger value="usage">{strings.accounts.tabs.usage}</TabsTrigger>
          <TabsTrigger value="throttle">{strings.accounts.tabs.throttle}</TabsTrigger>
          <TabsTrigger value="failure">{strings.accounts.tabs.failure}</TabsTrigger>
        </TabsList>
        <TabsContent value="usage">
          <AccountUsageTab id={id} />
        </TabsContent>
        <TabsContent value="throttle">
          <EventLogTable kind="throttle" credentialId={id} />
        </TabsContent>
        <TabsContent value="failure">
          <EventLogTable kind="failure" credentialId={id} />
        </TabsContent>
      </Tabs>

      <EditAccountDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
    </section>
  )
}
