import { useMemo, useState } from "react"
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
import { AddAccountDialog } from "@/components/accounts/AddAccountDialog"
import { AccountTable } from "@/components/accounts/AccountTable"
import { AccountToolbar, type AccountSort } from "@/components/accounts/AccountToolbar"
import {
  accountName,
  accountStatus,
  matchesStatusFilter,
  type AccountStatus,
  type AccountStatusFilter,
} from "@/lib/account-status"
import { useAccounts, useDeleteAccount, useResetFailure, useVerifyAccounts } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { CredentialStatusItem } from "@/lib/types"

const statusRank: Record<AccountStatus, number> = {
  available: 0,
  lowQuota: 1,
  needsLogin: 2,
  disabled: 3,
  exhausted: 4,
}

function matchesSearch(item: CredentialStatusItem, term: string): boolean {
  if (!term) return true
  return [accountName(item), item.email ?? "", item.provider ?? "", String(item.id)]
    .join(" ")
    .toLowerCase()
    .includes(term)
}

function compareAccounts(sort: AccountSort) {
  return (a: CredentialStatusItem, b: CredentialStatusItem) => {
    if (sort === "account") {
      return accountName(a).localeCompare(accountName(b), "zh-CN")
    }
    if (sort === "remaining") {
      const diff = statusRank[accountStatus(a).status] - statusRank[accountStatus(b).status]
      if (diff !== 0) return diff
    }
    return a.priority - b.priority || accountName(a).localeCompare(accountName(b), "zh-CN")
  }
}

const EMPTY_ACCOUNTS: CredentialStatusItem[] = []

export function AccountsPage() {
  const accountsQuery = useAccounts()
  const verifyAccounts = useVerifyAccounts()
  const resetFailure = useResetFailure()
  const deleteAccount = useDeleteAccount()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("all")
  const [sort, setSort] = useState<AccountSort>("priority")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const accounts = accountsQuery.data?.credentials ?? EMPTY_ACCOUNTS
  const term = search.trim().toLowerCase()

  const filtered = useMemo(
    () =>
      accounts
        .filter(
          (item) => matchesStatusFilter(item, statusFilter) && matchesSearch(item, term),
        )
        .sort(compareAccounts(sort)),
    [accounts, sort, statusFilter, term],
  )

  const selectedItems = useMemo(
    () => filtered.filter((item) => selectedIds.has(item.id)),
    [filtered, selectedIds],
  )

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setSelectedIds(new Set())
  }

  const handleStatusFilterChange = (value: AccountStatusFilter) => {
    setStatusFilter(value)
    setSelectedIds(new Set())
  }

  const handleToggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleAll = (ids: number[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id))
      for (const id of ids) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const handleVerify = () => {
    if (selectedItems.length === 0) return
    verifyAccounts.mutate(
      selectedItems.map((item) => item.id),
      { onSuccess: () => setSelectedIds(new Set()) },
    )
  }

  const handleRestore = () => {
    for (const item of selectedItems) resetFailure.mutate(item.id)
    setSelectedIds(new Set())
  }

  const handleDelete = () => {
    for (const item of selectedItems) deleteAccount.mutate(item.id)
    setBatchDeleteOpen(false)
    setSelectedIds(new Set())
  }

  return (
    <section aria-label={strings.accounts.title} className="flex flex-col gap-3">
      <AccountToolbar
        search={search}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        sort={sort}
        onSortChange={setSort}
        selectedCount={selectedItems.length}
        onVerify={handleVerify}
        onRestore={handleRestore}
        onDelete={() => setBatchDeleteOpen(true)}
        onAdd={() => setAddOpen(true)}
      />

      {accountsQuery.isLoading ? (
        <div className="rounded-[16px] border border-border bg-card p-10 text-center text-[12.5px] text-muted-foreground">
          {strings.common.loading}
        </div>
      ) : null}

      {accountsQuery.isError ? (
        <div className="rounded-[16px] border border-border bg-card p-10 text-center text-[12.5px] text-danger">
          {strings.errors.loadFailed}
        </div>
      ) : null}

      {!accountsQuery.isLoading && !accountsQuery.isError ? (
        <AccountTable
          accounts={filtered}
          selectedIds={selectedIds}
          onToggleSelected={handleToggleSelected}
          onToggleAll={handleToggleAll}
          emptyMessage={
            accounts.length === 0 ? strings.accounts.empty : strings.accounts.emptyFiltered
          }
        />
      ) : null}

      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.accounts.batchDelete}</AlertDialogTitle>
            <AlertDialogDescription>
              {strings.accounts.batchDeleteConfirm(selectedItems.length)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.common.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleDelete}>
              {strings.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </section>
  )
}
