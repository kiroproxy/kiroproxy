import { useMemo, useState } from "react"
import { BoxesIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LoadError } from "@/components/shell/LoadError"
import { usePageHeader } from "@/components/shell/page-header"
import { accountName } from "@/lib/account-status"
import { fmtNumber } from "@/lib/format"
import { useAccountModels, useAccounts, useModels } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { ModelView } from "@/lib/types"

const FAMILIES = [
  { key: "claude", label: strings.models.families.claude, match: ["claude", "sonnet", "opus", "haiku"] },
  { key: "gpt", label: strings.models.families.gpt, match: ["gpt", "codex"] },
  { key: "deepseek", label: strings.models.families.deepseek, match: ["deepseek"] },
  { key: "glm", label: strings.models.families.glm, match: ["glm"] },
  { key: "minimax", label: strings.models.families.minimax, match: ["minimax"] },
  { key: "qwen", label: strings.models.families.qwen, match: ["qwen"] },
  { key: "kimi", label: strings.models.families.kimi, match: ["kimi"] },
] as const

const FAMILY_ORDER: string[] = [...FAMILIES.map((item) => item.key), "other"]
const NEW_MODEL_DAYS = 30

function familyOf(model: ModelView): string {
  const haystack = `${model.id} ${model.displayName}`.toLowerCase()
  const family = FAMILIES.find((item) => item.match.some((needle) => haystack.includes(needle)))
  return family?.key ?? "other"
}

function familyLabel(key: string): string {
  return FAMILIES.find((item) => item.key === key)?.label ?? strings.models.families.other
}

function isRecent(releasedAt?: string | null): boolean {
  if (!releasedAt) return false
  const released = new Date(releasedAt).getTime()
  return Number.isFinite(released) && Date.now() - released < NEW_MODEL_DAYS * 86_400_000
}

function ModelTable({ models }: { models: ModelView[] }) {
  const headClass = "text-[12px] text-muted-foreground"
  return (
    <div className="overflow-clip rounded-[12px] border border-border">
      <Table className="table-fixed">
        <colgroup>
          <col />
          <col className="w-[32%]" />
          <col className="w-[110px]" />
          <col className="w-[96px]" />
          <col className="w-[120px]" />
        </colgroup>
        <TableHeader>
          <TableRow className="h-10 hover:bg-transparent">
            <TableHead className={headClass}>{strings.models.displayName}</TableHead>
            <TableHead className={headClass}>{strings.models.modelId}</TableHead>
            <TableHead className={`${headClass} text-right`}>{strings.models.maxTokens}</TableHead>
            <TableHead className={`${headClass} text-right`}>{strings.models.rateMultiplier}</TableHead>
            <TableHead className={headClass}>{strings.models.releasedAt}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.map((model) => (
            <TableRow key={model.id}>
              <TableCell>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{model.displayName || model.id}</span>
                  {isRecent(model.releasedAt) ? <Badge variant="success">{strings.models.newBadge}</Badge> : null}
                </span>
              </TableCell>
              <TableCell className="truncate font-mono text-[11.5px] text-muted-foreground">{model.id}</TableCell>
              <TableCell className="num text-right text-muted-foreground">
                {model.maxTokens > 0 ? fmtNumber(model.maxTokens) : "—"}
              </TableCell>
              <TableCell className="num text-right">
                {model.rateMultiplier == null ? "—" : `${model.rateMultiplier}x`}
              </TableCell>
              <TableCell className="num text-muted-foreground">{model.releasedAt ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function AccountProbe() {
  const accounts = useAccounts()
  const [probeId, setProbeId] = useState<number | null>(null)
  const probe = useAccountModels(probeId ?? 0, probeId !== null)
  const probeAccount = accounts.data?.credentials.find((account) => account.id === probeId)

  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <CardTitle>{strings.models.accountProbe}</CardTitle>
        <CardDescription>{strings.models.probeHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Select
          value={probeId === null ? "" : String(probeId)}
          onValueChange={(value) => setProbeId(Number(value) || null)}
        >
          <SelectTrigger className="w-[320px]" aria-label={strings.models.selectAccount}>
            <span className="truncate">
              {probeAccount ? accountName(probeAccount) : strings.models.selectAccount}
            </span>
          </SelectTrigger>
          <SelectContent>
            {(accounts.data?.credentials ?? []).map((account) => (
              <SelectItem key={account.id} value={String(account.id)}>
                {accountName(account)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {probeId !== null && probe.isFetching && !probe.data ? <Skeleton className="h-24 w-full" /> : null}
        {probeId !== null && probe.isError ? (
          <p className="text-[12px] text-text-danger">{probe.error.message}</p>
        ) : null}
        {probeId !== null && probe.data ? <ModelTable models={probe.data} /> : null}
      </CardContent>
    </Card>
  )
}

export function ModelsPage() {
  const models = useModels()
  const [search, setSearch] = useState("")

  usePageHeader(
    {
      badges: models.data ? <Badge variant="neutral">{models.data.length}</Badge> : null,
    },
    [models.data?.length],
  )

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = (models.data ?? []).filter(
      (model) => !term || `${model.id} ${model.displayName}`.toLowerCase().includes(term),
    )
    const map = new Map<string, ModelView[]>()
    for (const model of filtered) {
      const key = familyOf(model)
      map.set(key, [...(map.get(key) ?? []), model])
    }
    return [...map.entries()].sort(([a], [b]) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b))
  }, [models.data, search])

  return (
    <section aria-label={strings.models.title} className="flex flex-col gap-3">
      <div className="relative w-fit">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
          aria-hidden="true"
        />
        <Input
          value={search}
          placeholder={strings.models.searchPlaceholder}
          aria-label={strings.models.searchPlaceholder}
          className="w-[260px] rounded-full pl-8"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {models.isError ? <LoadError error={models.error} onRetry={() => void models.refetch()} /> : null}
      {models.isLoading ? <Skeleton className="h-48 w-full rounded-[16px]" /> : null}

      {groups.map(([key, list]) => (
        <Card key={key} className="gap-3">
          <CardHeader className="grid-cols-[1fr_auto] items-center pb-0">
            <CardTitle>{familyLabel(key)}</CardTitle>
            <span className="num text-[11.5px] text-muted-foreground">{list.length}</span>
          </CardHeader>
          <CardContent>
            <ModelTable models={list} />
          </CardContent>
        </Card>
      ))}

      {!models.isLoading && !models.isError && groups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>{strings.models.empty}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : null}

      <AccountProbe />
    </section>
  )
}
