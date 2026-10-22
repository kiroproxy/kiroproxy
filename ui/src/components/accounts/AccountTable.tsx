import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { tableFeatures, useTable, type ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon, UsersIcon } from "lucide-react"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { accountName, maskEmail } from "@/lib/account-status"
import { fmtDateTime } from "@/lib/format"
import { useDeleteAccount, useResetFailure, useSetDisabled, useSetPriority } from "@/lib/queries"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"
import type { CredentialStatusItem } from "@/lib/types"
import { AccountQuotaCell } from "./AccountQuotaBars"
import { AccountStatusBadge } from "./AccountStatusBadge"

const features = tableFeatures({})

function AccountCell({ item }: { item: CredentialStatusItem }) {
  const name = accountName(item)
  const email = maskEmail(item.email)
  return (
    <div className="flex items-center gap-2.5">
      <Avatar size="sm">
        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <Link to={`/accounts/${item.id}`} className="block truncate font-medium hover:underline">
          {name}
        </Link>
        {email && email !== name ? (
          <span className="block truncate text-[11.5px] text-muted-foreground">{email}</span>
        ) : null}
      </div>
    </div>
  )
}

function AccountRowMenu({ item }: { item: CredentialStatusItem }) {
  const navigate = useNavigate()
  const deleteAccount = useDeleteAccount()
  const setDisabled = useSetDisabled()
  const setPriority = useSetPriority()
  const resetFailure = useResetFailure()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="icon" size="icon" aria-label={strings.common.actions} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/accounts/${item.id}`)}>
            {strings.accounts.details}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPriority.mutate({ id: item.id, priority: 0 })}>
            {strings.accounts.pin}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => resetFailure.mutate(item.id)}>
            {strings.accounts.resetFailure}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDisabled.mutate({ id: item.id, disabled: !item.disabled })}
          >
            {item.disabled ? strings.accounts.enable : strings.accounts.disable}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            {strings.accounts.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.accounts.delete}</AlertDialogTitle>
            <AlertDialogDescription>
              {accountName(item)} · {strings.accounts.deleteConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={deleteAccount.isPending}
              onClick={() => deleteAccount.mutate(item.id, { onSuccess: () => setConfirmOpen(false) })}
            >
              {strings.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const baseColumns: ColumnDef<typeof features, CredentialStatusItem>[] = [
  {
    accessorKey: "nickname",
    header: strings.accounts.columns.account,
    cell: ({ row }) => <AccountCell item={row.original} />,
  },
  {
    id: "status",
    header: strings.accounts.columns.status,
    cell: ({ row }) => <AccountStatusBadge item={row.original} />,
  },
  {
    accessorKey: "priority",
    header: strings.accounts.columns.priority,
    cell: ({ getValue }) => <span className="num">#{getValue<number>() + 1}</span>,
  },
  {
    id: "quota",
    header: strings.accounts.columns.quota,
    cell: ({ row }) => <AccountQuotaCell id={row.original.id} enabled={!row.original.disabled} />,
  },
  {
    id: "lastUsedAt",
    header: strings.accounts.columns.lastUsed,
    cell: ({ row }) => (
      <span className="num text-muted-foreground">{fmtDateTime(row.original.lastUsedAt)}</span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">{strings.accounts.columns.actions}</span>,
    cell: ({ row }) => <AccountRowMenu item={row.original} />,
  },
]

export interface AccountTableProps {
  accounts: CredentialStatusItem[]
  selectedIds?: ReadonlySet<number>
  onToggleSelected?: (id: number) => void
  onToggleAll?: (ids: number[]) => void
  emptyMessage?: string
  emptyHint?: string
}

export function AccountTable({
  accounts,
  selectedIds,
  onToggleSelected,
  onToggleAll,
  emptyMessage = strings.accounts.empty,
  emptyHint,
}: AccountTableProps) {
  const selectable = selectedIds !== undefined && onToggleSelected !== undefined

  const columns = useMemo<ColumnDef<typeof features, CredentialStatusItem>[]>(() => {
    if (!selectable) return baseColumns
    const selectionColumn: ColumnDef<typeof features, CredentialStatusItem> = {
      id: "select",
      header: () => (
        <Checkbox
          aria-label={strings.common.all}
          checked={accounts.length > 0 && accounts.every((item) => selectedIds.has(item.id))}
          onCheckedChange={() => onToggleAll?.(accounts.map((item) => item.id))}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={accountName(row.original)}
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => onToggleSelected?.(row.original.id)}
        />
      ),
    }
    return [selectionColumn, ...baseColumns]
  }, [accounts, onToggleAll, onToggleSelected, selectable, selectedIds])

  // 行 id 绑定账号 id，列表重排时行内状态（如已打开的删除确认）不会串到别的账号。
  const table = useTable({
    features,
    columns,
    data: accounts,
    getRowId: (row) => String(row.id),
  })

  if (accounts.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyMessage}</EmptyTitle>
          {emptyHint ? <EmptyDescription>{emptyHint}</EmptyDescription> : null}
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="h-10 hover:bg-transparent">
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    "text-[12px] text-muted-foreground",
                    header.column.id === "actions" && "w-10",
                  )}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={selectedIds?.has(row.original.id) ? "selected" : undefined}
              className={cn(row.original.disabled && "text-muted-foreground")}
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
