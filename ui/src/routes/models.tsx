import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAccountModels, useAccounts, useModels } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { AdminModelItem } from "@/lib/types"

const FAMILIES = [
  { key: "claude", label: strings.models.families.claude, match: ["claude", "sonnet", "opus", "haiku"] },
  { key: "gpt", label: strings.models.families.gpt, match: ["gpt", "codex"] },
  { key: "deepseek", label: strings.models.families.deepseek, match: ["deepseek"] },
  { key: "glm", label: strings.models.families.glm, match: ["glm"] },
  { key: "minimax", label: strings.models.families.minimax, match: ["minimax"] },
  { key: "qwen", label: strings.models.families.qwen, match: ["qwen"] },
  { key: "kimi", label: strings.models.families.kimi, match: ["kimi"] },
] as const

function familyOf(model: AdminModelItem): string {
  const haystack = `${model.id} ${model.displayName ?? ""}`.toLowerCase()
  const family = FAMILIES.find((item) => item.match.some((needle) => haystack.includes(needle)))
  return family?.key ?? "other"
}

function familyLabel(key: string): string {
  return FAMILIES.find((item) => item.key === key)?.label ?? strings.models.families.other
}

function ModelTable({ models }: { models: AdminModelItem[] }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>显示名</TableHead>
            <TableHead>Kiro 模型 ID</TableHead>
            <TableHead>{strings.models.rateMultiplier}</TableHead>
            <TableHead>{strings.models.releasedAt}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.map((model) => (
            <TableRow key={model.id}>
              <TableCell className="font-medium">{model.displayName || model.id}</TableCell>
              <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                {model.id}
              </TableCell>
              <TableCell className="num">
                {model.rateMultiplier == null ? "—" : `${model.rateMultiplier}x`}
              </TableCell>
              <TableCell className="num text-muted-foreground">
                {model.releasedAt ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ModelsPage() {
  const models = useModels()
  const accounts = useAccounts()
  const [search, setSearch] = useState("")
  const [probeId, setProbeId] = useState<number | null>(null)
  const probe = useAccountModels(probeId ?? 0, probeId !== null)

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = (models.data ?? []).filter((model) => {
      if (!term) return true
      return `${model.id} ${model.displayName ?? ""}`.toLowerCase().includes(term)
    })
    const map = new Map<string, AdminModelItem[]>()
    for (const model of filtered) {
      const key = familyOf(model)
      const list = map.get(key) ?? []
      list.push(model)
      map.set(key, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [models.data, search])

  return (
    <section aria-label={strings.models.title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-[17px] font-semibold">{strings.models.upstream}</h2>
        <Badge variant="neutral">{models.data?.length ?? 0}</Badge>
        <Input
          value={search}
          placeholder={strings.models.searchPlaceholder}
          className="max-w-[240px]"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {models.isLoading ? (
        <div className="rounded-[16px] border border-border bg-card p-8 text-center text-muted-foreground">
          {strings.common.loading}
        </div>
      ) : null}

      {groups.map(([key, list]) => (
        <Card key={key} className="gap-3">
          <CardHeader className="pb-0">
            <CardTitle className="font-serif">{familyLabel(key)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelTable models={list} />
          </CardContent>
        </Card>
      ))}

      {!models.isLoading && groups.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-card p-8 text-center text-muted-foreground">
          {strings.models.empty}
        </div>
      ) : null}

      <Card className="gap-3">
        <CardHeader className="pb-0">
          <CardTitle className="font-serif">{strings.models.accountProbe}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{strings.models.selectAccount}</span>
            <Select
              value={probeId === null ? "" : String(probeId)}
              onValueChange={(value) => setProbeId(Number(value) || null)}
            >
              <SelectTrigger className="max-w-[320px]">
                <SelectValue placeholder={strings.models.selectAccount} />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data?.credentials ?? []).map((account) => (
                  <SelectItem key={account.id} value={String(account.id)}>
                    #{account.id} {account.nickname || account.email || ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {probe.isFetching ? (
            <span className="text-[12px] text-muted-foreground">{strings.common.loading}</span>
          ) : null}
          {probeId !== null && probe.data ? <ModelTable models={probe.data} /> : null}
          {probeId !== null && !probe.isFetching && probe.isError ? (
            <span className="text-[12px] text-text-danger">{strings.errors.loadFailed}</span>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
