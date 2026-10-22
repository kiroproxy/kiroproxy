import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { PlusIcon } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AddAccountDialog, type AddAccountTab } from "@/components/accounts/AddAccountDialog"
import { AccountTable } from "@/components/accounts/AccountTable"
import { AccountToolbar, type AccountSort } from "@/components/accounts/AccountToolbar"
import { BatchVerifyDialog } from "@/components/accounts/BatchVerifyDialog"
import { LoadError } from "@/components/shell/LoadError"
import { usePageHeader } from "@/components/shell/page-header"
import {
  accountName,
  accountStatus,
  accountStatusFilters,
  type AccountStatus,
  type AccountStatusFilter,
} from "@/lib/account-status"
import { ipc } from "@/lib/ipc"
import { useAccountBalances, useAccounts, useBatchAccountAction } from "@/lib/queries"
import { strings } from "@/lib/strings"
import type { BalanceResponse, CredentialStatusItem } from "@/lib/types"

const statusRank: Record<AccountStatus, number> = {
  available: 0,
  lowQuota: 1,
  unstable: 2,
  needsLogin: 3,
  disabled: 4,
  exhausted: 5,
}

function matchesSearch(item: CredentialStatusItem, term: string): boolean {
  if (!term) return true
  return [accountName(item), item.email ?? "", item.provider ?? "", String(item.id)]
    .join(" ")
    .toLowerCase()
    .includes(term)
}

function remainingOf(balance?: BalanceResponse): number {
  return balance && balance.usageLimit > 0 ? balance.remaining : -1
}

const EMPTY_ACCOUNTS: CredentialStatusItem[] = []

export function AccountsPage() {
  const accountsQuery = useAccounts()
  const batch = useBatchAccountAction()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("all")
  const [sort, setSort] = useState<AccountSort>("priority")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)

  const addParam = searchParams.get("add")
  const addTab: AddAccountTab | null =
    addParam === "manual" || addParam === "kiroide" || addParam === "kam" || addParam === "oauth"
      ? addParam
      : null
  const setAddTab = (tab: AddAccountTab | null) => {
    const next = new URLSearchParams(searchParams)
    if (tab) next.set("add", tab)
    else next.delete("add")
    setSearchParams(next, { replace: true })
  }

  usePageHeader(
    {
      actions: (
        <Button onClick={() => setAddTab("oauth")}>
          <PlusIcon />
          {strings.accounts.addAccount}
        </Button>
      ),
    },
    [searchParams],
  )

  const accounts = accountsQuery.data?.credentials ?? EMPTY_ACCOUNTS
  const balances = useAccountBalances(accounts.filter((item) => !item.disabled).map((item) => item.id))
  const term = search.trim().toLowerCase()

  const statusOf = useMemo(() => {
    const map = new Map<number, AccountStatus>()
    for (const item of accounts) map.set(item.id, accountStatus(item, balances.get(item.id)).status)
    return map
  }, [accounts, balances])

  const counts = useMemo(() => {
    const result = Object.fromEntries(accountStatusFilters.map((filter) => [filter, 0])) as Record<
      AccountStatusFilter,
      number
    >
    result.all = accounts.length
    for (const status of statusOf.values()) result[status] += 1
    return result
  }, [accounts.length, statusOf])

  const filtered = useMemo(() => {
    const rows = accounts.filter(
      (item) =>
        (statusFilter === "all" || statusOf.get(item.id) === statusFilter) &&
        matchesSearch(item, term),
    )
    return rows.sort((a, b) => {
      if (sort === "account") return accountName(a).localeCompare(accountName(b), "zh-CN")
      if (sort === "remaining") {
        const rank = statusRank[statusOf.get(a.id) ?? "available"] - statusRank[statusOf.get(b.id) ?? "available"]
        if (rank !== 0) return rank
        const diff = remainingOf(balances.get(b.id)) - remainingOf(balances.get(a.id))
        if (diff !== 0) return diff
      }
      return a.priority - b.priority || accountName(a).localeCompare(accountName(b), "zh-CN")
    })
  }, [accounts, balances, sort, statusFilter, statusOf, term])

  const selectedItems = useMemo(
    () => filtered.filter((item) => selectedIds.has(item.id)),
    [filtered, selectedIds],
  )

  const resetSelection = () => setSelectedIds(new Set())

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

  const runBatch = (action: string, run: (id: number) => Promise<unknown>) => {
    const ids = selectedItems.map((item) => item.id)
    if (ids.length === 0) return
    batch.mutate(
      { ids, run },
      {
        onSuccess: ({ success, failed }) => {
          const message = strings.accounts.batchResult(action, success, failed)
          if (failed > 0) toast.warning(message)
          else toast.success(message)
          resetSelection()
        },
      },
    )
  }

  return (
    <section aria-label={strings.accounts.title} className="flex flex-col">
      <AccountToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value)
          resetSelection()
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(value) => {
          setStatusFilter(value)
          resetSelection()
        }}
        counts={counts}
        sort={sort}
        onSortChange={setSort}
        selectedCount={selectedItems.length}
        onVerify={() => {
          if (selectedItems.length > 0) setVerifyOpen(true)
        }}
        onRestore={() => runBatch(strings.accounts.batchRestore, (id) => ipc.resetAccountFailure(id))}
        onDelete={() => setBatchDeleteOpen(true)}
      />

      {accountsQuery.isLoading ? (
        <div className="flex flex-col gap-2 rounded-[16px] border border-border bg-card p-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : accountsQuery.isError ? (
        <LoadError error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />
      ) : (
        <AccountTable
          accounts={filtered}
          selectedIds={selectedIds}
          onToggleSelected={handleToggleSelected}
          onToggleAll={handleToggleAll}
          emptyMessage={accounts.length === 0 ? strings.accounts.empty : strings.accounts.emptyFiltered}
          emptyHint={accounts.length === 0 ? strings.accounts.emptyHint : undefined}
        />
      )}

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
            <AlertDialogAction
              variant="danger"
              disabled={batch.isPending}
              onClick={() => {
                setBatchDeleteOpen(false)
                runBatch(strings.accounts.batchDelete, (id) => ipc.deleteAccount(id))
              }}
            >
              {strings.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddAccountDialog
        open={addTab !== null}
        tab={addTab ?? "oauth"}
        onOpenChange={(open) => {
          if (!open) setAddTab(null)
        }}
      />
      <BatchVerifyDialog
        ids={selectedItems.map((item) => item.id)}
        open={verifyOpen}
        onOpenChange={(open) => {
          setVerifyOpen(open)
          if (!open) resetSelection()
        }}
      />
    </section>
  )
}
