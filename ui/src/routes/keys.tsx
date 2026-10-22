import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { KeyConfirmDialog, type KeyAction } from "@/components/keys/KeyConfirmDialog"
import { KeyDialog } from "@/components/keys/KeyDialog"
import { LoadError } from "@/components/shell/LoadError"
import { usePageHeader } from "@/components/shell/page-header"
import { quotaTone } from "@/lib/account-status"
import { quotaPercent, quotaText } from "@/lib/api-key"
import { errorMessage, ipc } from "@/lib/ipc"
import { fmtDateTime, fmtNumber } from "@/lib/format"
import { useAllApiKeyUsage, useApiKeys } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { ApiKeyView, UsageSummary } from "@/lib/types"

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
  const navigate = useNavigate()
  // 每次打开对话框都换一个 session 作为 key，表单从当前值重新初始化，不会带出上一次的输入；
  // 关闭时组件保持挂载，退出动画不受影响。
  const [dialog, setDialog] = useState<{ open: boolean; editing: ApiKeyView | null; session: number }>({
    open: false,
    editing: null,
    session: 0,
  })
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const [pending, setPending] = useState<KeyAction>(null)

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
                      <Link to={`/keys/${key.id}`} className="font-medium hover:underline">
                        {key.name}
                      </Link>
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
                          <DropdownMenuItem onClick={() => navigate(`/keys/${key.id}`)}>
                            {strings.keys.viewDetails}
                          </DropdownMenuItem>
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

      <KeyConfirmDialog action={pending} onClose={() => setPending(null)} />
    </section>
  )
}
