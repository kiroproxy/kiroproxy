import { useEffect, useRef } from "react"
import { ArrowUpDownIcon, ListChecksIcon, PlusIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { accountStatusFilters, type AccountStatusFilter } from "@/lib/account-status"
import { strings } from "@/lib/strings"

export type AccountSort = "account" | "remaining" | "priority"

const filterLabels: Record<AccountStatusFilter, string> = {
  all: strings.accounts.filterAll,
  available: strings.accounts.filterAvailable,
  lowQuota: strings.accounts.filterLow,
  exhausted: strings.accounts.filterExhausted,
  needsLogin: strings.accounts.filterNeedsLogin,
  disabled: strings.accounts.filterDisabled,
}

const sortOptions: { value: AccountSort; label: string }[] = [
  { value: "account", label: strings.accounts.sortByAccount },
  { value: "remaining", label: strings.accounts.sortByRemaining },
  { value: "priority", label: strings.accounts.sortByPriority },
]

const sortLabel = (sort: AccountSort) =>
  sortOptions.find((option) => option.value === sort)?.label ?? strings.accounts.sort

export interface AccountToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: AccountStatusFilter
  onStatusFilterChange: (value: AccountStatusFilter) => void
  sort: AccountSort
  onSortChange: (value: AccountSort) => void
  selectedCount: number
  onVerify: () => void
  onRestore: () => void
  onDelete: () => void
  onAdd: () => void
}

export function AccountToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sort,
  onSortChange,
  selectedCount,
  onVerify,
  onRestore,
  onDelete,
  onAdd,
}: AccountToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
        <Input
          ref={searchRef}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={strings.accounts.searchPlaceholder}
          aria-label={strings.common.search}
          className="w-52 pl-8"
        />
      </div>

      <Tabs
        value={statusFilter}
        onValueChange={(value) => onStatusFilterChange(value as AccountStatusFilter)}
      >
        <TabsList aria-label={strings.accounts.filterLabel}>
          {accountStatusFilters.map((filter) => (
            <TabsTrigger key={filter} value={filter}>
              {filterLabels[filter]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {selectedCount > 0 ? (
          <span className="num text-[12px] text-muted-foreground">
            {strings.accounts.selected(selectedCount)}
          </span>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                aria-label={`${strings.accounts.sort}：${sortLabel(sort)}`}
              />
            }
          >
            <ArrowUpDownIcon />
            {sortLabel(sort)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => onSortChange(value as AccountSort)}
            >
              {sortOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                disabled={selectedCount === 0}
                aria-label={strings.accounts.batchActions}
              />
            }
          >
            <ListChecksIcon />
            {strings.accounts.batchActions}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onVerify}>{strings.accounts.batchVerify}</DropdownMenuItem>
            <DropdownMenuItem onClick={onRestore}>{strings.accounts.batchRestore}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              {strings.accounts.batchDelete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button onClick={onAdd}>
          <PlusIcon />
          {strings.accounts.addAccount}
        </Button>
      </div>
    </div>
  )
}
