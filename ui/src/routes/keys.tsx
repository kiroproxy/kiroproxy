import { useMemo, useState } from "react"
import { CopyIcon, EyeIcon, EyeOffIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ipc } from "@/lib/ipc"
import { fmtCost, fmtNumber } from "@/lib/format"
import {
  useAccounts,
  useAllApiKeyUsage,
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  useResetApiKeyUsage,
  useUpdateApiKey,
} from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { ApiKeyView, CreateApiKeyRequest, UsageSummary } from "@/lib/types"

function quotaText(key: ApiKeyView): string {
  if (key.spendingLimit == null) return strings.keys.noLimit
  if (key.limitUnit === "credits") {
    return `${fmtNumber(key.usedAmount)} / ${fmtNumber(key.spendingLimit)} credits`
  }
  return `${fmtCost(key.usedAmount)} / ${fmtCost(key.spendingLimit)}`
}

function quotaPercent(key: ApiKeyView): number {
  if (key.spendingLimit == null || key.spendingLimit <= 0) return 0
  return Math.min(100, (key.usedAmount / key.spendingLimit) * 100)
}

function KeyDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ApiKeyView | null
}) {
  const accounts = useAccounts()
  const create = useCreateApiKey()
  const update = useUpdateApiKey()
  const [name, setName] = useState(editing?.name ?? "")
  const [limitUnit, setLimitUnit] = useState<"usd" | "credits">(editing?.limitUnit ?? "usd")
  const [spendingLimit, setSpendingLimit] = useState(
    editing?.spendingLimit != null ? String(editing.spendingLimit) : "",
  )
  const [durationDays, setDurationDays] = useState(
    editing?.durationDays != null ? String(editing.durationDays) : "",
  )
  const [enabled, setEnabled] = useState(editing?.enabled ?? true)
  const [bound, setBound] = useState<number[]>(editing?.boundCredentialIds ?? [])

  const save = () => {
    if (!name.trim()) {
      toast.error("名称不能为空")
      return
    }
    const base: CreateApiKeyRequest = {
      name: name.trim(),
      limitUnit,
      spendingLimit: spendingLimit ? Number(spendingLimit) : null,
      durationDays: durationDays ? Number(durationDays) : null,
      boundCredentialIds: bound.length > 0 ? bound : null,
    }
    const onError = (error: { message: string }) => toast.error(error.message)
    if (editing) {
      update.mutate(
        { id: editing.id, req: { ...base, enabled } },
        {
          onSuccess: () => {
            toast.success(strings.settings.saveStatusSaved)
            onOpenChange(false)
          },
          onError,
        },
      )
    } else {
      create.mutate(base, {
        onSuccess: () => {
          toast.success("密钥已创建")
          onOpenChange(false)
        },
        onError,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? strings.keys.editTitle : strings.keys.createTitle}</DialogTitle>
          <DialogDescription>{strings.keys.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-muted-foreground">{strings.keys.name}</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[12px] text-muted-foreground">{strings.keys.limitUnit}</Label>
              <Select
                value={limitUnit}
                onValueChange={(value) => setLimitUnit(String(value) as "usd" | "credits")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD</SelectItem>
                  <SelectItem value="credits">Credits</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[12px] text-muted-foreground">{strings.keys.spendingLimit}</Label>
              <Input
                type="number"
                min={0}
                placeholder={strings.keys.noLimit}
                value={spendingLimit}
                onChange={(event) => setSpendingLimit(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-muted-foreground">{strings.keys.durationDays}</Label>
            <Input
              type="number"
              min={0}
              placeholder="留空表示不启用懒激活"
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-muted-foreground">{strings.keys.boundAccounts}</Label>
            <div className="max-h-36 overflow-y-auto rounded-[10px] bg-subtle p-2">
              {(accounts.data?.credentials ?? []).length === 0 ? (
                <span className="text-[12px] text-muted-foreground">{strings.accounts.empty}</span>
              ) : null}
              {(accounts.data?.credentials ?? []).map((account) => (
                <label key={account.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                  <Checkbox
                    checked={bound.includes(account.id)}
                    onCheckedChange={(checked) =>
                      setBound((prev) =>
                        checked
                          ? Array.from(new Set([...prev, account.id]))
                          : prev.filter((id) => id !== account.id),
                      )
                    }
                  />
                  <span className="truncate">
                    #{account.id} {account.nickname || account.email || ""}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {editing ? (
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} />
              {strings.keys.enabled}
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {strings.common.cancel}
          </Button>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {strings.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function KeysPage() {
  const keys = useApiKeys()
  const usage = useAllApiKeyUsage()
  const deleteKey = useDeleteApiKey()
  const resetUsage = useResetApiKeyUsage()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ApiKeyView | null>(null)
  const [revealed, setRevealed] = useState<Record<number, string>>({})

  const usageById = useMemo(() => {
    const map = new Map<number, UsageSummary>()
    for (const item of usage.data ?? []) map.set(item.apiKeyId, item)
    return map
  }, [usage.data])

  const reveal = async (id: number) => {
    if (revealed[id]) {
      setRevealed((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      return
    }
    try {
      const secret = await ipc.getApiKeySecret(id)
      setRevealed((prev) => ({ ...prev, [id]: secret }))
    } catch (error) {
      toast.error((error as { message?: string }).message ?? strings.errors.actionFailed)
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(strings.common.copied)
    } catch {
      toast.error(strings.errors.actionFailed)
    }
  }

  const items = keys.data ?? []

  return (
    <section aria-label={strings.keys.title} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">{strings.keys.subtitle}</p>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <PlusIcon />
          {strings.keys.create}
        </Button>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{strings.keys.columns.name}</TableHead>
              <TableHead>{strings.keys.columns.key}</TableHead>
              <TableHead>{strings.keys.columns.status}</TableHead>
              <TableHead>{strings.keys.columns.boundAccounts}</TableHead>
              <TableHead>{strings.keys.columns.quota}</TableHead>
              <TableHead>{strings.keys.columns.used}</TableHead>
              <TableHead>{strings.keys.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {strings.common.loading}
                </TableCell>
              </TableRow>
            ) : null}
            {!keys.isLoading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {strings.keys.empty}
                </TableCell>
              </TableRow>
            ) : null}
            {items.map((key) => {
              const summary = usageById.get(key.id)
              return (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <code className="max-w-[180px] truncate font-mono text-[11.5px] text-muted-foreground">
                        {revealed[key.id] ?? key.maskedKey}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={revealed[key.id] ? strings.keys.hide : strings.keys.reveal}
                        onClick={() => void reveal(key.id)}
                      >
                        {revealed[key.id] ? <EyeOffIcon /> : <EyeIcon />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={strings.common.copy}
                        onClick={() => void copy(revealed[key.id] ?? key.maskedKey)}
                      >
                        <CopyIcon />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.enabled ? "success" : "neutral"}>
                      {key.enabled ? strings.common.enabled : strings.common.disabled}
                    </Badge>
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {key.boundCredentialIds?.length
                      ? strings.keys.boundCount(key.boundCredentialIds.length)
                      : "全部"}
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <div className="flex flex-col gap-1">
                      <span className="num text-[11.5px]">{quotaText(key)}</span>
                      <Progress value={quotaPercent(key)} />
                    </div>
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {fmtNumber(summary?.totalRequests ?? 0)} 次
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" aria-label={strings.common.actions} />}
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(key)
                            setDialogOpen(true)
                          }}
                        >
                          {strings.common.edit}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resetUsage.mutate(key.id)}>
                          {strings.keys.resetUsage}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => deleteKey.mutate(key.id)}
                        >
                          {strings.common.delete}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <KeyDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </section>
  )
}
