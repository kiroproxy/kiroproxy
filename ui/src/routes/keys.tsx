import { useMemo, useState } from "react"
import { CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LoadError } from "@/components/shell/LoadError"
import { usePageHeader } from "@/components/shell/page-header"
import { quotaTone } from "@/lib/account-status"
import { errorMessage, ipc } from "@/lib/ipc"
import { fmtCost, fmtCredits, fmtDateTime, fmtNumber } from "@/lib/format"
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
    return `${fmtCredits(key.usedAmount)} / ${fmtCredits(key.spendingLimit)} credits`
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
      toast.error(strings.keys.nameRequired)
      return
    }
    const base: CreateApiKeyRequest = {
      name: name.trim(),
      limitUnit,
      spendingLimit: spendingLimit.trim() ? Math.max(0, Number(spendingLimit)) : null,
      durationDays: durationDays.trim() ? Math.max(0, Number.parseInt(durationDays, 10) || 0) : null,
      boundCredentialIds: bound.length > 0 ? bound : null,
    }
    if (editing) {
      update.mutate(
        { id: editing.id, req: { ...base, enabled } },
        {
          onSuccess: () => {
            toast.success(strings.settings.saveStatusSaved)
            onOpenChange(false)
          },
        },
      )
    } else {
      create.mutate(base, {
        onSuccess: () => {
          toast.success(strings.keys.created)
          onOpenChange(false)
        },
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
          <FormField label={strings.keys.name}>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={strings.keys.limitUnit}>
              <Select
                value={limitUnit}
                onValueChange={(value) => setLimitUnit(String(value) as "usd" | "credits")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD</SelectItem>
                  <SelectItem value="credits">Credits</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={strings.keys.spendingLimit}>
              <Input
                type="number"
                min={0}
                placeholder={strings.keys.noLimit}
                value={spendingLimit}
                onChange={(event) => setSpendingLimit(event.target.value)}
              />
            </FormField>
          </div>
          <FormField label={strings.keys.durationDays}>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder={strings.keys.durationPlaceholder}
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
            />
          </FormField>

          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-muted-foreground">
              {strings.keys.boundAccounts}
            </legend>
            <div className="max-h-36 overflow-y-auto rounded-[10px] border border-border bg-subtle p-2">
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
          </fieldset>

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

type PendingAction = { kind: "delete" | "reset"; key: ApiKeyView } | null

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="icon" size="icon" aria-label={label} onClick={onClick} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function KeysPage() {
  const keys = useApiKeys()
  const usage = useAllApiKeyUsage()
  const deleteKey = useDeleteApiKey()
  const resetUsage = useResetApiKeyUsage()
  // 每次打开对话框都换一个 session 作为 key，表单从当前值重新初始化，不会带出上一次的输入；
  // 关闭时组件保持挂载，退出动画不受影响。
  const [dialog, setDialog] = useState<{ open: boolean; editing: ApiKeyView | null; session: number }>({
    open: false,
    editing: null,
    session: 0,
  })
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const [pending, setPending] = useState<PendingAction>(null)

  const openDialog = (editing: ApiKeyView | null) =>
    setDialog((prev) => ({ open: true, editing, session: prev.session + 1 }))
  const openCreate = () => openDialog(null)

  usePageHeader(
    {
      actions: (
        <Button onClick={openCreate}>
          <PlusIcon />
          {strings.keys.create}
        </Button>
      ),
    },
    [],
  )

  const usageById = useMemo(() => {
    const map = new Map<number, UsageSummary>()
    for (const item of usage.data ?? []) map.set(item.apiKeyId, item)
    return map
  }, [usage.data])

  const toggleReveal = async (id: number) => {
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
      toast.error(errorMessage(error))
    }
  }

  // 复制始终复制真实密钥：未显示时临时从后端读取，不改变显示状态。
  const copySecret = async (id: number) => {
    try {
      const secret = revealed[id] ?? (await ipc.getApiKeySecret(id))
      await navigator.clipboard.writeText(secret)
      toast.success(strings.keys.copiedSecret)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const confirmPending = () => {
    if (!pending) return
    const { kind, key } = pending
    const mutation = kind === "delete" ? deleteKey : resetUsage
    mutation.mutate(key.id, {
      onSuccess: () => {
        toast.success(kind === "delete" ? strings.keys.deleted : strings.keys.usageReset)
        setPending(null)
      },
    })
  }

  if (keys.isError) return <LoadError error={keys.error} onRetry={() => void keys.refetch()} />

  const items = keys.data ?? []
  const headClass = "text-[12px] text-muted-foreground"

  return (
    <section aria-label={strings.keys.title} className="flex flex-col gap-3">
      {keys.isLoading ? (
        <div className="flex flex-col gap-2 rounded-[16px] border border-border bg-card p-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRoundIcon />
            </EmptyMedia>
            <EmptyTitle>{strings.keys.empty}</EmptyTitle>
            <EmptyDescription>{strings.settings.defaultKeyHint}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={openCreate}>
              <PlusIcon />
              {strings.keys.create}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-clip rounded-[16px] border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="h-10 hover:bg-transparent">
                <TableHead className={headClass}>{strings.keys.columns.name}</TableHead>
                <TableHead className={headClass}>{strings.keys.columns.key}</TableHead>
                <TableHead className={headClass}>{strings.keys.columns.status}</TableHead>
                <TableHead className={headClass}>{strings.keys.columns.boundAccounts}</TableHead>
                <TableHead className={headClass}>{strings.keys.columns.quota}</TableHead>
                <TableHead className={`${headClass} text-right`}>{strings.keys.columns.used}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{strings.keys.columns.actions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((key) => {
                const summary = usageById.get(key.id)
                const percent = quotaPercent(key)
                return (
                  <TableRow key={key.id} className={key.enabled ? undefined : "text-muted-foreground"}>
                    <TableCell>
                      <div className="font-medium">{key.name}</div>
                      {key.expiresAt ? (
                        <div className="num text-[11.5px] text-muted-foreground">
                          {strings.keys.columns.expiresAt} {fmtDateTime(key.expiresAt)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <code className="mr-1 max-w-[200px] truncate font-mono text-[11.5px] text-muted-foreground">
                          {revealed[key.id] ?? key.maskedKey}
                        </code>
                        <IconAction
                          label={revealed[key.id] ? strings.keys.hide : strings.keys.reveal}
                          onClick={() => void toggleReveal(key.id)}
                        >
                          {revealed[key.id] ? <EyeOffIcon /> : <EyeIcon />}
                        </IconAction>
                        <IconAction label={strings.common.copy} onClick={() => void copySecret(key.id)}>
                          <CopyIcon />
                        </IconAction>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.enabled ? "success" : "neutral"}>
                        {key.enabled ? strings.common.enabled : strings.common.disabled}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.boundCredentialIds?.length
                        ? strings.keys.boundCount(key.boundCredentialIds.length)
                        : strings.keys.boundAll}
                    </TableCell>
                    <TableCell className="min-w-[160px]">
                      <div className="flex flex-col gap-1">
                        <span className="num text-[11.5px]">{quotaText(key)}</span>
                        {key.spendingLimit != null ? (
                          <Progress value={percent} tone={quotaTone(percent)} aria-label={quotaText(key)} />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="num text-right text-muted-foreground">
                      {strings.common.times(fmtNumber(summary?.totalRequests ?? 0))}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="icon" size="icon" aria-label={strings.common.actions} />}
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDialog(key)}>
                            {strings.common.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPending({ kind: "reset", key })}>
                            {strings.keys.resetUsage}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setPending({ kind: "delete", key })}
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
      )}

      <KeyDialog
        key={dialog.session}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        editing={dialog.editing}
      />

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "delete" ? strings.keys.deleteTitle : strings.keys.resetUsageTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.key.name} ·{" "}
              {pending?.kind === "delete" ? strings.keys.deleteConfirm : strings.keys.resetUsageConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={deleteKey.isPending || resetUsage.isPending}
              onClick={confirmPending}
            >
              {pending?.kind === "delete" ? strings.common.delete : strings.common.reset}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
