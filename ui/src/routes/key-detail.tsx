import { useMemo, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, PencilIcon, ReceiptTextIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { KeyConfirmDialog, type KeyAction } from "@/components/keys/KeyConfirmDialog"
import { KeyDialog } from "@/components/keys/KeyDialog"
import { LoadError } from "@/components/shell/LoadError"
import { Pager } from "@/components/shell/Pager"
import { usePageHeader } from "@/components/shell/page-header"
import { ModelBreakdownList } from "@/components/usage/ModelBreakdownList"
import { UsageRecordsTable } from "@/components/usage/UsageRecordsTable"
import { accountName, quotaTone } from "@/lib/account-status"
import { quotaPercent, quotaText, validityText } from "@/lib/api-key"
import { errorMessage, ipc } from "@/lib/ipc"
import { fmtCost, fmtCredits, fmtDateTime, fmtNumber } from "@/lib/format"
import { useAccounts, useApiKeys, useApiKeyUsage, useApiKeyUsageRecords } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { ApiKeyView } from "@/lib/types"

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 text-[12px]">
      <dt className="w-[72px] shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1 font-medium">{children}</dd>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="num truncate text-[18px] leading-tight font-semibold">{value}</div>
    </div>
  )
}

/** 密钥本身：掩码 / 明文切换、复制（总是复制真实密钥）、额度、绑定账号与有效期。 */
function KeyInfoCard({ apiKey }: { apiKey: ApiKeyView }) {
  const accounts = useAccounts()
  const [secret, setSecret] = useState("")
  const percent = quotaPercent(apiKey)
  const names = new Map((accounts.data?.credentials ?? []).map((item) => [item.id, accountName(item)]))
  const bound = apiKey.boundCredentialIds?.length
    ? apiKey.boundCredentialIds.map((id) => names.get(id) ?? `#${id}`).join("、")
    : strings.keys.boundAllAccounts

  const toggleSecret = async () => {
    if (secret) {
      setSecret("")
      return
    }
    try {
      setSecret(await ipc.getApiKeySecret(apiKey.id))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret || (await ipc.getApiKeySecret(apiKey.id)))
      toast.success(strings.keys.copiedSecret)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <CardTitle>{strings.keys.info}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2.5">
          <InfoRow label={strings.keys.columns.key}>
            <code className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">
              {secret || apiKey.maskedKey}
            </code>
            <Button
              variant="icon"
              size="icon"
              className="size-7"
              aria-label={secret ? strings.keys.hide : strings.keys.reveal}
              onClick={() => void toggleSecret()}
            >
              {secret ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
            <Button
              variant="icon"
              size="icon"
              className="size-7"
              aria-label={strings.common.copy}
              onClick={() => void copy()}
            >
              <CopyIcon />
            </Button>
          </InfoRow>
          <InfoRow label={strings.keys.columns.quota}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="num">{quotaText(apiKey)}</span>
              {apiKey.spendingLimit != null ? (
                <Progress value={percent} tone={quotaTone(percent)} aria-label={quotaText(apiKey)} />
              ) : null}
            </div>
          </InfoRow>
          <InfoRow label={strings.keys.columns.boundAccounts}>
            <span className="min-w-0 break-all">{bound}</span>
          </InfoRow>
          <InfoRow label={strings.keys.validity}>
            <span className="num">{validityText(apiKey)}</span>
          </InfoRow>
          <InfoRow label={strings.keys.createdAt}>
            <span className="num">{fmtDateTime(apiKey.createdAt)}</span>
          </InfoRow>
        </dl>
      </CardContent>
    </Card>
  )
}

function UsageCard({ id }: { id: number }) {
  const usage = useApiKeyUsage(id)
  const data = usage.data
  const byModel = useMemo(
    () => (data?.byModel ?? []).map((item) => ({ ...item, cacheReadTokens: 0 })),
    [data?.byModel],
  )

  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <CardTitle>{strings.keys.usage}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {usage.isError ? (
          <p className="text-[12px] text-text-danger">{errorMessage(usage.error)}</p>
        ) : usage.isLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
            <Metric label={strings.usage.requests} value={fmtNumber(data?.totalRequests ?? 0)} />
            <Metric label={strings.usage.inputTokens} value={fmtNumber(data?.totalInputTokens ?? 0)} />
            <Metric label={strings.usage.outputTokens} value={fmtNumber(data?.totalOutputTokens ?? 0)} />
            <Metric label={strings.usage.credits} value={fmtCredits(data?.totalCredits ?? 0)} />
            <Metric label={strings.usage.cost} value={fmtCost(data?.totalCost ?? 0)} />
          </div>
        )}
        {byModel.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-[11.5px] font-medium text-muted-foreground">{strings.keys.byModel}</span>
            <ModelBreakdownList items={byModel} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function KeyRecords({ id }: { id: number }) {
  const [page, setPage] = useState(1)
  const records = useApiKeyUsageRecords(id, page)

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
          <EmptyTitle>{strings.keys.noUsage}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col">
      <UsageRecordsTable records={data.records} />
      <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
    </div>
  )
}

/** 单个密钥：明文密钥（默认隐藏）、用量汇总、调用记录，以及编辑 / 重置用量 / 删除。 */
export function KeyDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const keys = useApiKeys()
  const navigate = useNavigate()
  const apiKey = keys.data?.find((item) => item.id === id)
  const [dialog, setDialog] = useState({ open: false, session: 0 })
  const [action, setAction] = useState<KeyAction>(null)

  usePageHeader(
    {
      title: apiKey?.name ?? strings.keys.details,
      back: "/keys",
      badges: apiKey ? (
        <Badge variant={apiKey.enabled ? "success" : "neutral"}>
          {apiKey.enabled ? strings.common.enabled : strings.common.disabled}
        </Badge>
      ) : null,
      actions: apiKey ? (
        <>
          <Button variant="secondary" onClick={() => setAction({ kind: "reset", key: apiKey })}>
            {strings.keys.resetUsage}
          </Button>
          <Button variant="danger" onClick={() => setAction({ kind: "delete", key: apiKey })}>
            {strings.common.delete}
          </Button>
          <Button onClick={() => setDialog((prev) => ({ open: true, session: prev.session + 1 }))}>
            <PencilIcon />
            {strings.common.edit}
          </Button>
        </>
      ) : null,
    },
    [apiKey],
  )

  if (keys.isError) return <LoadError error={keys.error} onRetry={() => void keys.refetch()} />
  if (!apiKey) {
    return keys.isLoading ? (
      <Skeleton className="h-64 w-full rounded-[16px]" />
    ) : (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRoundIcon />
          </EmptyMedia>
          <EmptyTitle>{strings.keys.notFound}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} variant="secondary" render={<Link to="/keys" />}>
            {strings.keys.backToList}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <section aria-label={strings.keys.details} className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <KeyInfoCard apiKey={apiKey} />
        <UsageCard id={id} />
      </div>

      <h2 className="pt-1 font-serif text-[15px] font-semibold">{strings.usage.recordsTitle}</h2>
      <KeyRecords id={id} />

      <KeyDialog
        key={dialog.session}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        editing={apiKey}
      />
      <KeyConfirmDialog action={action} onClose={() => setAction(null)} onDeleted={() => navigate("/keys")} />
    </section>
  )
}
