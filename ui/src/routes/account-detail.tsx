import { useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QuotaRing } from "@/components/charts/QuotaRing"
import { AccountDetailHeader } from "@/components/accounts/AccountDetailHeader"
import { AccountFailureTab } from "@/components/accounts/AccountFailureTab"
import { AccountInfoCard } from "@/components/accounts/AccountInfoCard"
import { AccountThrottleTab } from "@/components/accounts/AccountThrottleTab"
import { AccountUsageTab } from "@/components/accounts/AccountUsageTab"
import { EditAccountDialog } from "@/components/accounts/EditAccountDialog"
import { fmtCost, fmtDateTime, fmtNumber } from "@/lib/format"
import {
  useAccountBalance,
  useAccountModels,
  useAccounts,
  queryKeys,
} from "@/lib/queries"
import { strings } from "@/lib/strings"

function BalanceCard({ id }: { id: number }) {
  const balance = useAccountBalance(id)
  const value = balance.data?.usagePercentage ?? 0

  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <CardTitle className="font-serif">{strings.accounts.balanceTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-5">
        <QuotaRing size={112} fiveHour={value} sevenDay={0} />
        <div className="min-w-0 flex-1 space-y-2 text-[12px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">{strings.accounts.subscription}</span>
            <span className="font-semibold">{balance.data?.subscriptionTitle ?? "—"}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">{strings.accounts.currentUsage}</span>
            <span className="num font-semibold">
              {fmtNumber(balance.data?.currentUsage ?? 0)} / {fmtNumber(balance.data?.usageLimit ?? 0)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">{strings.accounts.remaining}</span>
            <span className="num font-semibold">{fmtNumber(balance.data?.remaining ?? 0)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">{strings.accounts.resetAt}</span>
            <span className="num">
              {balance.data?.nextResetAt
                ? fmtDateTime(new Date(balance.data.nextResetAt * 1000).toISOString())
                : "—"}
            </span>
          </div>
          <p className="text-[10.5px] leading-4 text-faint">
            Kiro 未提供 5 小时 / 7 天分窗口数据，外环为月度使用率。
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ModelsCard({ id }: { id: number }) {
  const models = useAccountModels(id)
  const items = models.data?.slice(0, 8) ?? []

  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <CardTitle className="font-serif">{strings.accounts.modelsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1.5">
        {models.isLoading ? (
          <span className="text-[12px] text-muted-foreground">{strings.common.loading}</span>
        ) : null}
        {!models.isLoading && items.length === 0 ? (
          <span className="text-[12px] text-muted-foreground">{strings.accounts.noModels}</span>
        ) : null}
        {items.map((model) => (
          <Badge key={model.id} variant="neutral" className="max-w-full truncate">
            {model.displayName || model.id}
          </Badge>
        ))}
        {(models.data?.length ?? 0) > items.length ? (
          <span className="self-center text-[11px] text-muted-foreground">
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
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const item = useMemo(
    () => accounts.data?.credentials.find((credential) => credential.id === id),
    [accounts.data, id],
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: ["balance", id] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accountModels(id) }),
        queryClient.invalidateQueries({ queryKey: ["credentialUsage", id] }),
        queryClient.invalidateQueries({ queryKey: ["credentialToday", id] }),
        queryClient.invalidateQueries({ queryKey: ["throttleLogs", id] }),
        queryClient.invalidateQueries({ queryKey: ["failureLogs", id] }),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  if (!item) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => history.back()}>
            {strings.common.back}
          </Button>
          <span className="text-[12.5px] text-muted-foreground">
            {accounts.isLoading ? strings.common.loading : strings.accounts.emptyFiltered}
          </span>
        </div>
      </section>
    )
  }

  return (
    <section aria-label={strings.accounts.details} className="flex flex-col gap-3">
      <AccountDetailHeader
        item={item}
        onEdit={() => setEditOpen(true)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <AccountInfoCard item={item} />
        <div className="flex flex-col gap-3">
          <BalanceCard id={id} />
          <ModelsCard id={id} />
          <Card>
            <CardContent className="flex items-center justify-between gap-3 pt-1 text-[12px]">
              <span className="text-muted-foreground">{strings.accounts.todayUsage}</span>
              <span className="num font-semibold">
                {fmtNumber(item.successCount)} 次成功 · {fmtCost(0)}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="usage" className="gap-3">
        <TabsList>
          <TabsTrigger value="usage">{strings.accounts.tabs.usage}</TabsTrigger>
          <TabsTrigger value="throttle">{strings.accounts.tabs.throttle}</TabsTrigger>
          <TabsTrigger value="failure">{strings.accounts.tabs.failure}</TabsTrigger>
        </TabsList>
        <TabsContent value="usage">
          <AccountUsageTab id={id} />
        </TabsContent>
        <TabsContent value="throttle">
          <AccountThrottleTab id={id} />
        </TabsContent>
        <TabsContent value="failure">
          <AccountFailureTab id={id} />
        </TabsContent>
      </Tabs>

      <EditAccountDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
    </section>
  )
}
